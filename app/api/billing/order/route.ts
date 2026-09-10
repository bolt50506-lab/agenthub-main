import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });

    const body = await req.json();
    const businessId = String(body.businessId || '');
    const planSlug = String(body.planSlug || '');
    const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const paymentMethod = String(body.paymentMethod || 'jazzcash');

    if (!businessId || !['starter', 'professional', 'enterprise'].includes(planSlug)) return NextResponse.json({ error: 'Invalid business or plan.' }, { status: 400 });
    if (!['easypaisa', 'jazzcash', 'bank_transfer'].includes(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });

    const { data: membership } = await supabase
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'You do not have permission to change this subscription.' }, { status: 403 });

    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .maybeSingle();
    if (planError || !plan) return NextResponse.json({ error: 'Selected plan is unavailable.' }, { status: 404 });

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id,name,country,phone')
      .eq('id', businessId)
      .single();
    if (businessError || !business) return NextResponse.json({ error: 'Business not found.' }, { status: 404 });

    const discount = planSlug === 'enterprise' ? 10 : planSlug === 'starter' ? 4 : 7;
    const baseUsdCents = billingCycle === 'yearly'
      ? Math.round(Number(plan.price_cents) * 12 * (1 - discount / 100))
      : Number(plan.price_cents);
    const isPakistan = String(business.country || 'PK').toUpperCase() === 'PK';
    const exchangeRate = isPakistan ? await getUsdToPkrRate() : null;
    if (isPakistan && !exchangeRate) return NextResponse.json({ error: 'Live USD to PKR conversion is temporarily unavailable. Please try again.' }, { status: 503 });
    const currency = isPakistan ? 'PKR' : 'USD';
    const amountCents = isPakistan ? Math.round((baseUsdCents / 100) * Number(exchangeRate) * 100) : baseUsdCents;
    const orderNumber = `AH-${Date.now()}-${randomBytes(4).toString('hex')}`.slice(0, 64);

    const { data: order, error: orderError } = await supabase.from('public_checkout_orders').insert({
      order_number: orderNumber,
      plan_id: plan.id,
      billing_cycle: billingCycle,
      customer_name: userData.user.user_metadata?.full_name || userData.user.email || 'AgentHub customer',
      customer_email: userData.user.email,
      business_name: business.name,
      whatsapp_number: business.phone || userData.user.user_metadata?.phone || null,
      country_code: isPakistan ? 'PK' : 'US',
      encrypted_password: 'existing-account-order',
      currency,
      amount_cents: amountCents,
      base_amount_cents: baseUsdCents,
      exchange_rate: exchangeRate,
      payment_method: paymentMethod,
      status: 'pending_payment',
      gateway: 'manual',
      business_id: businessId,
      user_id: userData.user.id,
    }).select('id').single();
    if (orderError || !order) throw new Error(orderError?.message || 'Unable to create payment order.');

    return NextResponse.json({ orderNumber, checkoutUrl: `/payment/manual?order=${encodeURIComponent(orderNumber)}` });
  } catch (error) {
    console.error('[Billing Order] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start payment.' }, { status: 500 });
  }
}
