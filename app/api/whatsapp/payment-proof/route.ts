import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits || null;
}

function authorized(req: NextRequest) {
  const configured = process.env.AGENTHUB_WEBHOOK_SECRET;
  if (!configured) return true;
  return req.headers.get('authorization') === `Bearer ${configured}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const sessionId = String(body.session_id || '').trim();
    const phone = normalizePhone(body.phone_number || body.from);
    const imageBase64 = String(body.image_base64 || '').trim();
    const mimeType = String(body.mime_type || 'image/jpeg').trim();
    const messageId = String(body.message_id || '').trim() || null;
    const caption = String(body.caption || '').trim() || null;

    if (!sessionId || !phone || !imageBase64) return NextResponse.json({ error: 'session_id, phone_number and image_base64 are required.' }, { status: 400 });
    if (!mimeType.startsWith('image/')) return NextResponse.json({ error: 'Only image payment proofs are supported.' }, { status: 400 });
    const bytes = Buffer.from(imageBase64, 'base64');
    if (bytes.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'Payment screenshot is too large.' }, { status: 413 });

    const supabase = createServiceClient();
    const { data: session } = await supabase.from('whatsapp_sessions').select('id,business_id,session_id,phone_number,status').eq('session_id', sessionId).maybeSingle();
    if (!session?.business_id) return NextResponse.json({ error: 'WhatsApp session is not linked to a business.' }, { status: 404 });

    // For AgentHub subscription sales, the connected WhatsApp business is the
    // seller. The customer's future business_id does not exist until approval.
    // Therefore the safe pre-approval identity is the real WhatsApp sender number.
    // Never match a pending order by business name alone.
    const pushName = String(body.push_name || '').trim();
    let { data: order } = await supabase
      .from('public_checkout_orders')
      .select('id,order_number,customer_name,customer_email,business_name,business_id,amount_cents,currency,payment_reference,status,whatsapp_number')
      .eq('whatsapp_number', phone)
      .in('status', ['pending_payment','pending_review','rejected'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Backward-compatible fallback for orders created before WhatsApp number
    // became mandatory. Only use it when the WhatsApp sender's push name matches
    // exactly one still-pending checkout order, so we never guess between customers.
    if (!order && pushName) {
      const { data: legacyCandidates } = await supabase
        .from('public_checkout_orders')
        .select('id,order_number,customer_name,customer_email,business_name,business_id,amount_cents,currency,payment_reference,status,whatsapp_number')
        .ilike('customer_name', pushName)
        .is('whatsapp_number', null)
        .in('status', ['pending_payment','pending_review','rejected'])
        .order('created_at', { ascending: false })
        .limit(2);
      if ((legacyCandidates || []).length === 1) order = legacyCandidates![0] as any;
    }

    if (messageId) {
      const { data: duplicate } = await supabase.from('payment_verifications').select('id,status').contains('metadata', { whatsapp_message_id: messageId }).maybeSingle();
      if (duplicate) return NextResponse.json({ ok: true, status: duplicate.status, duplicate: true });
    }

    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const path = `whatsapp/${session.business_id}/${phone}/${Date.now()}-${messageId || 'message'}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const verificationBusinessId = order?.business_id || null;
    const { data: verification, error } = await supabase.from('payment_verifications').insert({
      business_id: verificationBusinessId,
      order_id: order?.id || null,
      channel: 'whatsapp',
      session_id: sessionId,
      sender_phone: phone,
      customer_name: order?.customer_name || pushName || null,
      screenshot_path: path,
      payment_reference: order?.payment_reference || null,
      amount: order?.amount_cents != null ? Number(order.amount_cents) / 100 : null,
      currency: order?.currency || null,
      status: 'pending_review',
      metadata: {
        whatsapp_message_id: messageId,
        seller_business_id: session.business_id,
        caption,
        matched_order_number: order?.order_number || null,
        matched_email: order?.customer_email || null,
        matched_business_name: order?.business_name || null,
      },
    }).select('id,status,order_id').single();
    if (error || !verification) throw new Error(error?.message || 'Unable to create payment verification');

    if (order?.id && ['pending_payment','rejected'].includes(order.status)) {
      await supabase.from('public_checkout_orders').update({ payment_screenshot_path: path, status: 'pending_review', submitted_at: new Date().toISOString(), rejection_reason: null }).eq('id', order.id);
    }

    return NextResponse.json({ ok: true, status: 'pending_review', verification_id: verification.id, matched_order: !!order, matched_business_name: order?.business_name || null, message: order ? 'Payment screenshot received and sent for admin approval.' : 'Payment screenshot received, but no pending order matches this WhatsApp number. Admin review is required before any access is granted.' });
  } catch (error) {
    console.error('[WhatsApp Payment Proof] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to process payment screenshot.' }, { status: 500 });
  }
}
