import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

async function getUsdToPkrRate() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    const data = await response.json();
    const rate = Number(data?.rates?.PKR);
    if (response.ok && Number.isFinite(rate) && rate > 0) return rate;
  } catch {}
  return null;
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
    if (!['easypaisa','jazzcash','bank_transfer'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans').select('*').eq('slug', planSlug).eq('is_active', true).maybeSingle();
    if (planError || !plan) return NextResponse.json({ error: 'Selected plan is no longer available.' }, { status: 404 });

    const monthlyUsdCents = Number(plan.price_cents);
    const discount = plan.slug === 'enterprise' ? 10 : plan.slug === 'starter' ? 4 : 7;
    const baseAmountCents = billingCycle === 'yearly'
      ? Math.round(monthlyUsdCents * 12 * (1 - discount / 100))
      : monthlyUsdCents;

    const isPakistan = countryCode === 'PK';
    const exchangeRate = isPakistan ? await getUsdToPkrRate() : null;
    if (isPakistan && !exchangeRate) {
      return NextResponse.json({ error: 'Live USD to PKR conversion is temporarily unavailable. Please try again.' }, { status: 503 });
    }

    const currency = isPakistan ? 'PKR' : 'USD';
    const amountCents = isPakistan
      ? Math.round((baseAmountCents / 100) * Number(exchangeRate) * 100)
      : baseAmountCents;

    const orderNumber = `AH-${Date.now()}-${randomBytes(4).toString('hex')}`.slice(0, 64);
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
        encrypted_password: encryptPassword(password),
        currency,
        amount_cents: amountCents,
        base_amount_cents: baseAmountCents,
        exchange_rate: exchangeRate,
        payment_method: paymentMethod,
        status: 'pending_payment',
        gateway: 'manual',
      })
      .select('id')
      .single();

    if (orderError || !order) throw new Error(orderError?.message || 'Unable to create payment order');

    return NextResponse.json({
      checkoutUrl: `/payment/manual?order=${encodeURIComponent(orderNumber)}`,
      orderNumber,
    });
  } catch (error) {
    console.error('[Checkout] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed.' }, { status: 500 });
  }
}
