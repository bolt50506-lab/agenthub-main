import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { business_id: string };
  const { business_id } = body;

  if (!business_id) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();
  const serviceUrl = process.env.WHATSAPP_QR_SERVICE_URL || 'http://localhost:3001';

  // Check for existing session for this business
  const { data: existing } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('business_id', business_id)
    .eq('connection_method', 'qr_code')
    .maybeSingle();

  /*
  --------------------------------------------------------------------------
  IMPORTANT: never trust a "connected" DB row blindly.

  The WhatsApp service keeps sessions in memory only. If it restarted
  since this row was last written, the socket is gone even though the
  database still says "connected". Verify against the live service
  before short-circuiting - this is the same stale-session problem
  qr/status guards against, and start needs the same guard so it
  doesn't tell the dashboard "already connected" when it isn't.
  --------------------------------------------------------------------------
  */

  if (existing?.status === 'connected' && existing.session_id) {
    try {
      const liveCheck = await fetch(`${serviceUrl}/sessions/${existing.session_id}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (liveCheck.ok) {
        const liveData = await liveCheck.json().catch(() => ({}));
        if (String(liveData.status).toLowerCase() === 'connected') {
          return NextResponse.json({
            session_id: existing.id,
            status: 'connected',
            phone_number: existing.phone_number,
          }, { headers: CORS });
        }
      }
      // Service doesn't confirm "connected" (or the session id is gone) -
      // fall through and start a fresh session below.
    } catch {
      // Service unreachable - fall through and start fresh below.
    }
  }

  /*
  --------------------------------------------------------------------------
  Clean up any previous session for this business BEFORE creating a new
  one - both in the database and, just as importantly, on the WhatsApp
  service itself. Previously a brand-new random session id was minted on
  every retry without ever telling the WhatsApp service to drop the old
  one, which orphaned an auth folder on disk every single time someone
  clicked "Start" after an error or a stale/expired QR. Always logging
  out the old Baileys-side session first prevents that pileup.
  --------------------------------------------------------------------------
  */

  if (existing) {
    if (existing.session_id) {
      try {
        await fetch(`${serviceUrl}/sessions/${existing.session_id}`, {
          method: 'DELETE',
        });
      } catch {
        // Best effort - the service may already be down or may not
        // recognize this session id anymore. Proceed regardless; we
        // still remove the stale DB row below so a new one can be
        // created cleanly.
      }
    }

    await supabase.from('whatsapp_sessions').delete().eq('id', existing.id);
  }

  // Create a unique session ID for the Baileys service
  const baileysSessionId = `wa_${business_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Insert session record in Supabase
  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .insert({
      business_id,
      connection_method: 'qr_code',
      session_id: baileysSessionId,
      status: 'creating_session',
      provider_name: 'baileys',
    })
    .select()
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500, headers: CORS });
  }

  // Call the external Baileys WhatsApp service
  try {
    const serviceRes = await fetch(`${serviceUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: baileysSessionId }),
    });

    if (!serviceRes.ok) {
      const errText = await serviceRes.text().catch(() => '');
      let errMsg = `Baileys service returned ${serviceRes.status}`;
      if (errText.trim()) {
        try { errMsg = JSON.parse(errText).error ?? errMsg; } catch { /* not JSON, use default */ }
      }

      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'error', error_message: errMsg })
        .eq('id', session.id);

      return NextResponse.json({ error: errMsg, session_id: session.id, status: 'error' }, { status: 502, headers: CORS });
    }

    // Safely parse the response — Baileys service may return empty body on creating_session
    const rawText = await serviceRes.text().catch(() => '');
    let serviceData: { qrCode?: string; qr?: string; status?: string; phone?: string; phoneNumber?: string; error?: string } = {};

    if (rawText.trim()) {
      try {
        serviceData = JSON.parse(rawText);
      } catch {
        // Response was not JSON — treat as session created without QR yet
        serviceData = { status: 'creating_session' };
      }
    } else {
      serviceData = { status: 'creating_session' };
    }

    // The Baileys service may return the QR code directly or via a status endpoint
    const qrCode = serviceData.qrCode ?? serviceData.qr ?? null;
    const phone = serviceData.phone ?? serviceData.phoneNumber ?? null;

    const dbStatus = qrCode ? 'waiting_for_scan' : 'generating_qr';

    await supabase
      .from('whatsapp_sessions')
      .update({
        qr_code_url: qrCode,
        status: dbStatus,
        phone_number: phone,
      })
      .eq('id', session.id);

    return NextResponse.json({
      session_id: session.id,
      baileys_session_id: baileysSessionId,
      qr_code: qrCode,
      status: dbStatus,
    }, { headers: CORS });
  } catch (err) {
    const errMsg = (err as Error).message;
    const isConnectionRefused = errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect');

    const userMessage = isConnectionRefused
      ? 'WhatsApp QR service is not running. Start the local AgentHub WhatsApp Service on port 3001.'
      : `Failed to reach WhatsApp QR service: ${errMsg}`;

    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'error', error_message: userMessage })
      .eq('id', session.id);

    return NextResponse.json({ error: userMessage, session_id: session.id, status: 'error' }, { status: 503, headers: CORS });
  }
}
