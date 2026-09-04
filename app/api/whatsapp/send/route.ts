import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const WHATSAPP_QR_SERVICE_URL =
  process.env.WHATSAPP_QR_SERVICE_URL || 'http://localhost:3001';

const OUTBOUND_API_TOKEN = process.env.OUTBOUND_API_TOKEN || '';

function normalizeWhatsAppJid(phone: string) {
  const value = phone.trim();
  if (value.includes('@')) return value;

  const digits = value.replace(/\D/g, '');
  if (!digits) return null;

  return `${digits}@s.whatsapp.net`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      business_id?: string;
      conversation_id?: string;
      message?: string;
    };

    const { business_id, conversation_id, message } = body;

    if (!business_id || !conversation_id || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: 'business_id, conversation_id and message are required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, business_id, customer_id, channel')
      .eq('id', conversation_id)
      .eq('business_id', business_id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.channel !== 'whatsapp') {
      return NextResponse.json(
        { success: false, error: 'This route only supports WhatsApp conversations' },
        { status: 400 }
      );
    }

    if (!conversation.customer_id) {
      return NextResponse.json(
        { success: false, error: 'This conversation has no customer phone number' },
        { status: 400 }
      );
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('phone, external_id')
      .eq('id', conversation.customer_id)
      .maybeSingle();

    const destination = normalizeWhatsAppJid(
      customer?.phone || customer?.external_id || ''
    );

    if (!destination) {
      return NextResponse.json(
        { success: false, error: 'Customer WhatsApp number is not available' },
        { status: 400 }
      );
    }

    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('session_id, status')
      .eq('business_id', business_id)
      .eq('connection_method', 'qr_code')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session?.session_id) {
      return NextResponse.json(
        { success: false, error: 'No connected WhatsApp QR session was found' },
        { status: 409 }
      );
    }

    const serviceResponse = await fetch(
      `${WHATSAPP_QR_SERVICE_URL}/sessions/${encodeURIComponent(session.session_id)}/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(OUTBOUND_API_TOKEN
            ? { Authorization: `Bearer ${OUTBOUND_API_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          to: destination,
          message: message.trim(),
        }),
        cache: 'no-store',
      }
    );

    const serviceData = await serviceResponse.json().catch(() => null);

    if (!serviceResponse.ok || serviceData?.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: serviceData?.message || 'WhatsApp provider could not send the message',
        },
        { status: 502 }
      );
    }

    const { error: insertError } = await supabase.from('messages').insert({
      business_id,
      conversation_id,
      sender_type: 'business',
      content: message.trim(),
      content_type: 'text',
      is_inbound: false,
      metadata: { sent_via: 'dashboard_whatsapp' },
    });

    if (insertError) {
      console.error('Dashboard WhatsApp message was sent but could not be recorded:', insertError.message);
    }

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard WhatsApp send error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
