import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { activateCheckoutOrder } from '@/lib/payments/activate-checkout-order';
import { deliverPendingNotifications } from '@/lib/notifications/deliver';

export const runtime = 'nodejs';

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  return profile?.is_super_admin ? user : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('payment_verifications')
    .select('id,business_id,order_id,conversation_id,channel,session_id,sender_phone,customer_name,screenshot_path,payment_reference,amount,currency,status,approved_at,rejected_at,rejection_reason,created_at,metadata')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const businessIds = [...new Set((data || []).map((x: any) => x.business_id).filter(Boolean))];
  const orderIds = [...new Set((data || []).map((x: any) => x.order_id).filter(Boolean))];
  const [{ data: businesses }, { data: orders }] = await Promise.all([
    businessIds.length ? supabase.from('businesses').select('id,name').in('id', businessIds) : Promise.resolve({ data: [] as any[] }),
    orderIds.length ? supabase.from('public_checkout_orders').select('id,order_number,customer_email,business_name,status').in('id', orderIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const businessMap = new Map((businesses || []).map((x: any) => [x.id, x]));
  const orderMap = new Map((orders || []).map((x: any) => [x.id, x]));

  const rows = await Promise.all((data || []).map(async (row: any) => {
    const signed = row.screenshot_path ? await supabase.storage.from('payment-proofs').createSignedUrl(row.screenshot_path, 600) : { data: null };
    return { ...row, business: businessMap.get(row.business_id) || null, order: orderMap.get(row.order_id) || null, screenshotUrl: signed.data?.signedUrl || null };
  }));
  const { data: pendingOrders } = await supabase
    .from('public_checkout_orders')
    .select('id,order_number,customer_name,customer_email,business_name,status,amount_cents,currency,whatsapp_number')
    .in('status', ['pending_payment','pending_review','rejected'])
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ verifications: rows, pendingOrders: pendingOrders || [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action, reason, orderId } = await req.json();
  if (!id || !['approve','reject','link_order'].includes(action)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const supabase = createServiceClient();
  const { data: verification } = await supabase.from('payment_verifications').select('*').eq('id', id).maybeSingle();
  if (!verification) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });

  if (action === 'link_order') {
    if (!orderId) return NextResponse.json({ error: 'Select a checkout order to link.' }, { status: 400 });
    const { data: order } = await supabase.from('public_checkout_orders').select('*').eq('id', String(orderId)).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Checkout order not found.' }, { status: 404 });
    if (!['pending_payment','pending_review','rejected'].includes(order.status)) return NextResponse.json({ error: 'That checkout order is not available for payment verification.' }, { status: 409 });

    const now = new Date().toISOString();
    const { error: linkError } = await supabase.from('payment_verifications').update({
      order_id: order.id,
      customer_name: order.customer_name,
      payment_reference: order.payment_reference || verification.payment_reference,
      amount: Number(order.amount_cents) / 100,
      currency: order.currency,
      status: 'pending_review',
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
      metadata: { ...(verification.metadata || {}), matched_order_number: order.order_number, matched_email: order.customer_email, matched_business_name: order.business_name, linked_by_admin: true, linked_at: now },
    }).eq('id', id);
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

    await supabase.from('public_checkout_orders').update({
      status: 'pending_review',
      payment_screenshot_path: verification.screenshot_path,
      submitted_at: now,
      rejection_reason: null,
    }).eq('id', order.id);

    return NextResponse.json({ ok: true, status: 'pending_review', linked_order: order.order_number });
  }

  if (verification.status !== 'pending_review') return NextResponse.json({ error: 'This verification is no longer pending. Link it to an order first if you need to re-review it.' }, { status: 409 });

  if (action === 'reject') {
    await supabase.from('payment_verifications').update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: admin.id, rejection_reason: String(reason || 'Payment could not be verified.') }).eq('id', id);
    if (verification.order_id) await supabase.from('public_checkout_orders').update({ status: 'rejected', rejection_reason: String(reason || 'Payment could not be verified.'), reviewed_at: new Date().toISOString(), reviewed_by: admin.id }).eq('id', verification.order_id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  if (!verification.order_id) return NextResponse.json({ error: 'No checkout order is linked. Link this WhatsApp proof to the correct pending order before approval.' }, { status: 409 });

  const { data: order } = await supabase.from('public_checkout_orders').select('*').eq('id', verification.order_id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Linked checkout order was not found.' }, { status: 404 });
  if (!['pending_payment','pending_review','rejected','fulfilled'].includes(order.status)) return NextResponse.json({ error: 'Order is not eligible for approval.' }, { status: 409 });

  try {
    const result = await activateCheckoutOrder(supabase, order, admin.id);
    const { error } = await supabase.from('payment_verifications').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: admin.id,
      business_id: result.businessId,
      rejection_reason: null,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await deliverPendingNotifications(supabase, 10).catch(() => null);
    return NextResponse.json({ ok: true, status: 'approved', businessId: result.businessId });
  } catch (error) {
    await supabase.from('public_checkout_orders').update({ status: 'pending_review', rejection_reason: error instanceof Error ? error.message : 'Activation failed.' }).eq('id', order.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to activate subscription.' }, { status: 500 });
  }
}
