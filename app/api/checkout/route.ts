
import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function getAppUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

function encryptPassword(value: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const planSlug = String(body.planSlug || '');
    const customerName = String(body.customerName || '').trim();
    const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
    const businessName = String(body.businessName || '').trim();
    const password = String(body.password || '');
    const countryCode = String(body.countryCode || 'PK').toUpperCase();
    const paymentMethod = String(body.paymentMethod || 'jazzcash');
    const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';

    if (!planSlug || !customerName || !customerEmail || !businessName || password.length < 8) {
      return NextResponse.json({ error: 'Please complete all checkout fields. Password must be at least 8 characters.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Selected plan is no longer available.' }, { status: 404 });
    }

    const monthlyCents = Number(plan.price_cents);
    const discount = plan.slug === 'enterprise' ? 10 : plan.slug === 'starter' ? 4 : 7;
    const amountCents = billingCycle === 'yearly'
      ? Math.round(monthlyCents * 12 * (1 - discount / 100))
      : monthlyCents;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'This plan does not have a valid checkout price.' }, { status: 400 });
    }

    const appKey = process.env.PAYNICORN_APP_KEY;
    const merchantSecret = process.env.PAYNICORN_APP_SECRET || process.env.PAYNICORN_MERCHANT_SECRET;

    if (!appKey || !merchantSecret) {
      return NextResponse.json({ error: 'Payment gateway is not configured yet. Please contact AgentHub support.' }, { status: 503 });
    }

    const orderNumber = `AH-${Date.now()}-${randomBytes(4).toString('hex')}`.slice(0, 64);
    const encryptedPassword = encryptPassword(password);

    const { data: order, error: orderError } = await supabase
      .from('public_checkout_orders')
      .insert({
        order_number: orderNumber,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        customer_name: customerName,
        customer_email: customerEmail,
        business_name: businessName,
        country_code: countryCode,
        encrypted_password: encryptedPassword,
        currency: 'USD',
        amount_cents: amountCents,
        status: 'pending',
        gateway: paymentMethod,
      })
      .select('id')
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message || 'Unable to create checkout order');
    }

    const appUrl = getAppUrl(req);
    const paymentRequest = {
      amount: (amountCents / 100).toFixed(2),
      countryCode,
      orderId: orderNumber,
      orderDescription: `AgentHub AI ${plan.name} subscription`,
      currency: 'USD',
      email: customerEmail,
      payByLocalCurrency: true,
      cpFrontPage: `${appUrl}/payment/result?order=${encodeURIComponent(orderNumber)}`,
      referenceNo: orderNumber.slice(-32),
      memo: JSON.stringify({ orderId: order.id, plan: plan.slug }),
    };

    const content = Buffer.from(JSON.stringify(paymentRequest), 'utf8').toString('base64');
    const sign = createHash('md5').update(content + merchantSecret).digest('hex');

    const response = await fetch('https://api.paynicorn.com/trade/v3/transaction/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey, content, sign }),
      cache: 'no-store',
    });

    const gatewayResponse = await response.json().catch(() => null);
    if (!response.ok || !gatewayResponse?.content || !gatewayResponse?.sign) {
      await supabase.from('public_checkout_orders').update({ status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ error: gatewayResponse?.responseMessage || 'Unable to start payment checkout.' }, { status: 502 });
    }

    const expectedSign = createHash('md5').update(gatewayResponse.content + merchantSecret).digest('hex');
    if (expectedSign !== gatewayResponse.sign) {
      await supabase.from('public_checkout_orders').update({ status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ error: 'Payment gateway response could not be verified.' }, { status: 502 });
    }

    const decoded = JSON.parse(Buffer.from(gatewayResponse.content, 'base64').toString('utf8'));
    if (!decoded?.webUrl) {
      await supabase.from('public_checkout_orders').update({ status: 'failed' }).eq('id', order.id);
      return NextResponse.json({ error: decoded?.message || 'Payment checkout URL was not returned.' }, { status: 502 });
    }

    await supabase
      .from('public_checkout_orders')
      .update({ gateway_transaction_id: decoded.txnId || null })
      .eq('id', order.id);

    return NextResponse.json({ checkoutUrl: decoded.webUrl, orderNumber });
  } catch (error) {
    console.error('[Checkout] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed.' }, { status: 500 });
  }
}
