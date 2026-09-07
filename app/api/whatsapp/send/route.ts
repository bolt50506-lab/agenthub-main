import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const WHATSAPP_QR_SERVICE_URL = process.env.WHATSAPP_QR_SERVICE_URL || 'https://agenthub-whatsapp-service-production.up.railway.app';
const OUTBOUND_API_TOKEN = process.env.OUTBOUND_API_TOKEN || '';
const HUMAN_SILENCE_MS = 2 * 60 * 1000;

function normalizeWhatsAppJid(phone: string) {
  const value = phone.trim();
  if (value.includes('@')) return value;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { business_id?: string; conversation_id?: string; message?: string };
    const { business_id, conversation_id, message } = body;
    if (!business_id || !conversation_id || !message?.trim()) return NextResponse.json({ success: false, error: 'business_id, conversation_id and message are required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: conversation } = await supabase.from('conversations').select('id, business_id, customer_id, channel').eq('id', conversation_id).eq('business_id', business_id).maybeSingle();
    if (!conversation) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    if (conversation.channel !== 'whatsapp') return NextResponse.json({ success: false, error: 'This route only supports WhatsApp conversations' }, { status: 400 });
    if (!conversation.customer_id) return NextResponse.json({ success: false, error: 'This conversation has no customer phone number' }, { status: 400 });

    const { data: customer } = await supabase.from('customers').select('phone, external_id').eq('id', conversation.customer_id).maybeSingle();
    const destination = normalizeWhatsAppJid(customer?.phone || customer?.external_id || '');
    if (!destination) return NextResponse.json({ success: false, error: 'Customer WhatsApp number is not available' }, { status: 400 });

    const { data: session } = await supabase.from('whatsapp_sessions').select('session_id, status').eq('business_id', business_id).eq('connection_method', 'qr_code').eq('status', 'connected').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!session?.session_id) return NextResponse.json({ success: false, error: 'No connected WhatsApp QR session was found' }, { status: 409 });

    // Claim the conversation for the human BEFORE sending the outbound message.
    // This closes the race where a customer message arriving during the send
    // could start an AI generation before the dashboard reply is recorded.
    // Every human message refreshes the two-minute silence window.
    const now = new Date();
    const aiResumeAt = new Date(now.getTime() + HUMAN_SILENCE_MS).toISOString();
    const nowIso = now.toISOString();
    const { error: takeoverError } = await supabase.from('conversations').update({
      human_takeover: true,
      ai_enabled: false,
      human_takeover_at: nowIso,
      ai_resume_at: aiResumeAt,
      last_message_at: nowIso,
    }).eq('id', conversation_id).eq('business_id', business_id);
    if (takeoverError) return NextResponse.json({ success: false, error: `Could not activate human takeover: ${takeoverError.message}` }, { status: 500 });

    const serviceResponse = await fetch(`${WHATSAPP_QR_SERVICE_URL}/sessions/${encodeURIComponent(session.session_id)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(OUTBOUND_API_TOKEN ? { Authorization: `Bearer ${OUTBOUND_API_TOKEN}` } : {}) },
      body: JSON.stringify({ to: destination, message: message.trim() }),
      cache: 'no-store',
    });
    const serviceData = await serviceResponse.json().catch(() => null);
    if (!serviceResponse.ok || serviceData?.success === false) {
      console.error('[WhatsApp] Human message send failed while takeover was active:', serviceData?.message || serviceResponse.status);
      return NextResponse.json({ success: false, error: serviceData?.message || 'WhatsApp provider could not send the message', human_takeover: true }, { status: 502 });
    }

    const { error: insertError } = await supabase.from('messages').insert({ business_id, conversation_id, sender_type: 'business', content: message.trim(), content_type: 'text', is_inbound: false, metadata: { sent_via: 'dashboard_whatsapp', human_takeover: true } });
    if (insertError) console.error('Dashboard WhatsApp message was sent but could not be recorded:', insertError.message);

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id).eq('business_id', business_id);

    return NextResponse.json({ success: true, mode: 'human', human_takeover: true, ai_resume_at: aiResumeAt });
  } catch (error) {
    console.error('Dashboard WhatsApp send error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
