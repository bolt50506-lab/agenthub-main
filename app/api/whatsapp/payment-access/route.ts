import { NextRequest, NextResponse } from 'next/server';
import { createHash, createDecipheriv } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits || null;
}

function wantsAccess(text: string) {
  return /\b(login|log in|sign in|signin|sign-in|access|account|credentials|password|dashboard|login details|account details|give me login|send login|sign me in|mujhe login|login dein|login den|account dein|access dein|dashboard ka access)\b/i.test(text);
}

function decryptPassword(value: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const [ivB64, tagB64, encryptedB64] = String(value || '').split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) throw new Error('Invalid encrypted password');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
}

function authorized(req: NextRequest) {
  const configured = process.env.AGENTHUB_WEBHOOK_SECRET;
  if (!configured) return true;
  return req.headers.get('authorization') === `Bearer ${configured}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const sessionId = String(body.session_id || '').trim();
    const phone = normalizePhone(body.phone_number || body.from);
    const message = String(body.message || '').trim();
    if (!sessionId || !phone || !message || !wantsAccess(message)) return NextResponse.json({ ok: true, handled: false });

    const supabase = createServiceClient();
    const { data: session } = await supabase.from('whatsapp_sessions').select('business_id').eq('session_id', sessionId).maybeSingle();
    if (!session?.business_id) return NextResponse.json({ ok: true, handled: true, reply: 'I could not verify this WhatsApp connection. Please contact the business administrator.' });

    const { data: verification } = await supabase
      .from('payment_verifications')
      .select('id,status,order_id,customer_name')
      .eq('business_id', session.business_id)
      .eq('channel', 'whatsapp')
      .eq('sender_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification || verification.status !== 'approved' || !verification.order_id) {
      const pending = verification?.status === 'pending_review';
      return NextResponse.json({
        ok: true,
        handled: true,
        reply: pending
          ? 'Your payment screenshot has been received and is still waiting for admin approval. I cannot provide account access until the payment is approved.'
          : 'I cannot provide account access yet. Please send your payment screenshot from the WhatsApp number used for your order, and the business administrator will verify it.'
      });
    }

    const { data: order } = await supabase
      .from('public_checkout_orders')
      .select('id,customer_email,encrypted_password,business_id,status')
      .eq('id', verification.order_id)
      .eq('business_id', session.business_id)
      .maybeSingle();

    if (!order || order.status !== 'fulfilled') {
      return NextResponse.json({ ok: true, handled: true, reply: 'Your payment is approved, but account activation is still being completed. Please try again shortly.' });
    }

    let password = '';
    try { password = decryptPassword(order.encrypted_password); } catch {
      return NextResponse.json({ ok: true, handled: true, reply: 'Your account is approved. Please contact the business administrator for your sign-in details.' });
    }

    await supabase.from('payment_verifications').update({ access_granted_at: new Date().toISOString() }).eq('id', verification.id);

    return NextResponse.json({
      ok: true,
      handled: true,
      reply: `Your AgentHub account is verified for this business.\n\nSign in: https://agenthubai.vercel.app/login\nEmail: ${order.customer_email}\nPassword: ${password}\n\nPlease keep these credentials private.`,
    });
  } catch (error) {
    console.error('[WhatsApp Payment Access] Failed:', error);
    return NextResponse.json({ ok: false, handled: true, error: error instanceof Error ? error.message : 'Unable to verify access.' }, { status: 500 });
  }
}
