import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';
type Channel = 'facebook_messenger' | 'instagram';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
function channelForType(type: string): Channel | null {
  return type === 'facebook_messenger' || type === 'instagram' ? type : null;
}

async function processWebhook(type: Channel, body: any) {
  // Existing message-processing logic is intentionally kept behind the
  // delivery diagnostic. Meta delivery must be proven before AI processing.
  const supabase = createServiceClient();
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const events = entries.flatMap((entry: any) => {
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    if (messaging.length) return messaging.map((event: any) => ({
      entryId: String(entry?.id || ''),
      senderId: String(event?.sender?.id || event?.from?.id || ''),
      recipientId: String(event?.recipient?.id || entry?.id || ''),
      messageId: String(event?.message?.mid || event?.message?.id || event?.id || ''),
      text: String(event?.message?.text || event?.text?.body || '').trim(),
      message: event?.message || event,
    }));
    return (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change: any) => {
      const value = change?.value || {};
      return (Array.isArray(value?.messages) ? value.messages : []).map((message: any) => ({
        entryId: String(entry?.id || ''),
        senderId: String(message?.from?.id || ''),
        recipientId: String(value?.recipient?.id || entry?.id || ''),
        messageId: String(message?.id || ''),
        text: String(message?.text?.body || message?.text || '').trim(),
        message,
      }));
    });
  });

  if (!events.length) {
    console.warn('Meta social webhook received no messaging events', { type, object: body?.object, entryCount: entries.length });
    return;
  }

  // IMPORTANT: Keep the delivery proof path independent of AI/DB conversation
  // processing. Once Meta delivery is confirmed, the existing handler can be
  // restored/extended without changing the webhook contract.
  console.log('Meta webhook delivery confirmed', {
    type,
    eventCount: events.length,
    entryCount: entries.length,
  });

  // Store a minimal inbound marker so delivery can be verified without storing
  // message text or access tokens.
  await supabase.from('webhook_debug_events').insert({
    channel: type,
    object_type: typeof body?.object === 'string' ? body.object : null,
    entry_count: entries.length,
    event_count: events.length,
    payload_keys: Object.keys(body || {}).slice(0, 20),
  });
}

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const type = channelForType(params.type);
  if (!type) return json({ error: 'Unsupported Meta channel' }, 404);

  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return json({ error: 'Invalid verification request' }, 403);
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('integrations')
    .select('id')
    .eq('type', type)
    .filter('config->>verify_token', 'eq', token)
    .limit(1)
    .maybeSingle();

  if (!data) return json({ error: 'Invalid verify token' }, 403);

  return new Response(challenge, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const type = channelForType(params.type);
  if (!type) return json({ error: 'Unsupported Meta channel' }, 404);

  // Read the request first and create the diagnostic record BEFORE any
  // application processing. This makes Meta delivery independently observable.
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    console.error('Meta webhook received invalid JSON', { type });
    return json({ ok: true });
  }

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const eventCount = entries.reduce((count: number, entry: any) => {
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging.length : 0;
    const changes = Array.isArray(entry?.changes)
      ? entry.changes.reduce((n: number, change: any) =>
          n + (Array.isArray(change?.value?.messages) ? change.value.messages.length : 0), 0)
      : 0;
    return count + messaging + changes;
  }, 0);

  try {
    const { error } = await createServiceClient().from('webhook_debug_events').insert({
      channel: type,
      object_type: typeof body?.object === 'string' ? body.object : null,
      entry_count: entries.length,
      event_count: eventCount,
      payload_keys: Object.keys(body || {}).slice(0, 20),
    });
    if (error) console.error('Webhook diagnostic insert failed:', error.message);
  } catch (error) {
    console.error('Webhook diagnostic exception:', error);
  }

  // Acknowledge Meta immediately. Do not make Meta wait for Gemini, Supabase
  // conversation work, or outbound API calls.
  const response = json({ ok: true }, 200);

  // Continue application processing after the response is constructed.
  // Note: Next.js serverless execution may terminate after the response, so
  // delivery diagnostics remain authoritative even if downstream work fails.
  try {
    await processWebhook(type, body);
  } catch (error) {
    console.error('Meta social webhook processing failed after delivery:', error);
  }

  return response;
}
