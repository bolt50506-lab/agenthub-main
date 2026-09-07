import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { activateCheckoutOrder } from '@/lib/payments/activate-checkout-order';

export const runtime = 'nodejs';

async function requireAdmin(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  const supabase = createServiceClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return null;
  const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  return profile?.is_super_admin ? user : null;
}


export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('public_checkout_orders').select('id,order_number,customer_name,customer_email,business_name,whatsapp_number,country_code,currency,amount_cents,payment_method,status,payment_screenshot_path,payment_reference,submitted_at,created_at,plan_id').not('submitted_at', 'is', null).not('payment_screenshot_path', 'is', null).order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  const planIds = [...new Set((data || []).map((row: any) => row.plan_id).filter(Boolean))];
  const { data: plans, error: plansError } = planIds.length ? await supabase.from('subscription_plans').select('id,name,slug').in('id', planIds) : { data: [], error: null };
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 });
  const planMap = new Map((plans || []).map((plan: any) => [plan.id, { name: plan.name, slug: plan.slug }]));
  const rows = await Promise.all((data || []).map(async (row: any) => {
    const signed = row.payment_screenshot_path ? await supabase.storage.from('payment-proofs').createSignedUrl(row.payment_screenshot_path, 600) : { data: null };
    return { ...row, subscription_plans: planMap.get(row.plan_id) || null, screenshotUrl: signed.data?.signedUrl || null };
  }));
  return NextResponse.json({ payments: rows, count: rows.length }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json(); const orderId = String(body.orderId || ''); const action = String(body.action || ''); const reason = String(body.reason || '').trim();
  if (!orderId || !['approve','reject'].includes(action)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const supabase = createServiceClient();
  const { data: order, error } = await supabase.from('public_checkout_orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order) return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  if (order.status !== 'pending_review') return NextResponse.json({ error: 'This payment is no longer pending review.' }, { status: 409 });
  if (action === 'reject') {
    await supabase.from('public_checkout_orders').update({ status: 'rejected', rejection_reason: reason || 'Payment could not be verified.', reviewed_at: new Date().toISOString(), reviewed_by: admin.id }).eq('id', order.id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }
  try {
    await activateCheckoutOrder(supabase, order, admin.id);
    return NextResponse.json({ ok: true, status: 'fulfilled' });
  } catch (e) {
    await supabase.from('public_checkout_orders').update({ status: 'pending_review', rejection_reason: e instanceof Error ? e.message : 'Activation failed.' }).eq('id', order.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to activate subscription.' }, { status: 500 });
  }
}
