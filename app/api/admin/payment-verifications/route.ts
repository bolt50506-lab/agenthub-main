import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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
  return NextResponse.json({ verifications: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action, reason } = await req.json();
  if (!id || !['approve','reject'].includes(action)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const supabase = createServiceClient();
  const { data: verification } = await supabase.from('payment_verifications').select('*').eq('id', id).maybeSingle();
  if (!verification) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });
  if (verification.status !== 'pending_review') return NextResponse.json({ error: 'This verification is no longer pending.' }, { status: 409 });

  if (action === 'reject') {
    await supabase.from('payment_verifications').update({ status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: admin.id, rejection_reason: String(reason || 'Payment could not be verified.') }).eq('id', id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // Approval is strictly scoped to the same business + WhatsApp number. If an
  // order is attached, it must belong to the same business before it can be fulfilled.
  if (!verification.business_id || !verification.sender_phone) return NextResponse.json({ error: 'Business or sender identity is missing.' }, { status: 409 });
  if (verification.order_id) {
    const { data: order } = await supabase.from('public_checkout_orders').select('id,business_id,status').eq('id', verification.order_id).maybeSingle();
    if (!order || order.business_id !== verification.business_id) return NextResponse.json({ error: 'Order/business mismatch. Access cannot be approved.' }, { status: 409 });
    if (!['pending_payment','pending_review','rejected','fulfilled'].includes(order.status)) return NextResponse.json({ error: 'Order is not eligible for approval.' }, { status: 409 });
    await supabase.from('public_checkout_orders').update({ status: 'fulfilled', reviewed_at: new Date().toISOString(), reviewed_by: admin.id, fulfilled_at: new Date().toISOString(), business_id: verification.business_id }).eq('id', order.id).in('status', ['pending_payment','pending_review','rejected']);
  }

  const { error } = await supabase.from('payment_verifications').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: admin.id }).eq('id', id).eq('status', 'pending_review');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'approved' });
}
