import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv, createHash } from 'crypto';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function requireAdmin() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const { data: profile } = await auth.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();
  return profile?.is_super_admin ? user : null;
}

function decryptPassword(value: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const [ivB64, tagB64, encryptedB64] = value.split('.');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('public_checkout_orders')
    .select('id,order_number,customer_name,customer_email,business_name,country_code,currency,amount_cents,payment_method,status,payment_screenshot_path,payment_reference,submitted_at,created_at,subscription_plans(name,slug)')
    .in('status', ['pending_review','approved','rejected'])
    .order('submitted_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await Promise.all((data || []).map(async (row: any) => {
    let screenshotUrl: string | null = null;
    if (row.payment_screenshot_path) {
      const signed = await supabase.storage.from('payment-proofs').createSignedUrl(row.payment_screenshot_path, 60 * 10);
      screenshotUrl = signed.data?.signedUrl || null;
    }
    return { ...row, screenshotUrl };
  }));
  return NextResponse.json({ payments: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const orderId = String(body.orderId || '');
  const action = String(body.action || '');
  const reason = String(body.reason || '').trim();
  if (!orderId || !['approve','reject'].includes(action)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from('public_checkout_orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order) return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  if (order.status !== 'pending_review') return NextResponse.json({ error: 'This payment is no longer pending review.' }, { status: 409 });

  if (action === 'reject') {
    await supabase.from('public_checkout_orders').update({
      status: 'rejected', rejection_reason: reason || 'Payment could not be verified.',
      reviewed_at: new Date().toISOString(), reviewed_by: admin.id,
    }).eq('id', order.id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  try {
    const password = decryptPassword(order.encrypted_password);
    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const already = existing?.users?.find((u) => u.email?.toLowerCase() === order.customer_email.toLowerCase());
    if (already) throw new Error('An AgentHub account already exists with this email.');

    const { data: created, error: userError } = await supabase.auth.admin.createUser({
      email: order.customer_email,
      password,
      email_confirm: true,
      user_metadata: { full_name: order.customer_name },
    });
    if (userError || !created.user) throw new Error(userError?.message || 'Unable to create customer account');

    const { data: business, error: businessError } = await supabase.from('businesses').insert({
      name: order.business_name,
      subscription_plan_id: order.plan_id,
      subscription_status: 'active',
      subscription_started_at: new Date().toISOString(),
      country: order.country_code,
      status: 'active',
    }).select('id').single();
    if (businessError || !business) throw new Error(businessError?.message || 'Unable to create business');

    await supabase.from('profiles').upsert({
      id: created.user.id, email: order.customer_email, full_name: order.customer_name,
      active_business_id: business.id, onboarding_completed: false,
    }, { onConflict: 'id' });

    await supabase.from('business_members').insert({
      business_id: business.id, user_id: created.user.id, role: 'owner', status: 'active',
    });

    const endDate = new Date();
    if (order.billing_cycle === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    await supabase.from('business_subscriptions').insert({
      business_id: business.id, plan_id: order.plan_id, status: 'active',
      billing_cycle: order.billing_cycle, start_date: new Date().toISOString(), end_date: endDate.toISOString(),
    });

    await supabase.from('public_checkout_orders').update({
      status: 'fulfilled', business_id: business.id, fulfilled_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(), reviewed_by: admin.id,
    }).eq('id', order.id);

    return NextResponse.json({ ok: true, status: 'fulfilled' });
  } catch (e) {
    await supabase.from('public_checkout_orders').update({
      status: 'pending_review', rejection_reason: e instanceof Error ? e.message : 'Activation failed.',
    }).eq('id', order.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to activate subscription.' }, { status: 500 });
  }
}