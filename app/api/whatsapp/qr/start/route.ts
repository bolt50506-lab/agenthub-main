import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const getServiceUrl = () =>
  (process.env.WHATSAPP_QR_SERVICE_URL || 'http://localhost:3001').replace(/\/+$/, '');

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req: NextRequest) {
  let dbSessionId: string | null = null;

  try {
    const body = await req.json() as { business_id?: string };
    const businessId = body.business_id?.trim();

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400, headers: CORS });
    }

    const supabase = createServiceClient();
    const serviceUrl = getServiceUrl();

    const { data: existing, error: lookupError } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('business_id', businessId)
      .eq('connection_method', 'qr_code')
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: lookupError.message },
        { status: 500, headers: CORS }
      );
    }

    // Never trust a stale "connected" row. Confirm the live service first.
    if (existing?.status === 'connected' && existing.session_id) {
      try {
        const liveCheck = await fetch(
          `${serviceUrl}/sessions/${encodeURIComponent(existing.session_id)}`,
          { method: 'GET', cache: 'no-store' }
        );

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
      } catch {
        // If the service is unavailable, continue and try to create a fresh session.
      }
    }

    // Remove the previous Baileys session, but KEEP the Supabase row stable.
    if (existing?.session_id) {
      try {
        await fetch(
          `${serviceUrl}/sessions/${encodeURIComponent(existing.session_id)}`,
          { method: 'DELETE', cache: 'no-store' }
        );
      } catch {
        // Best effort only. The service may already have forgotten the session.
      }
    }

    const baileysSessionId =
      `wa_${businessId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('whatsapp_sessions')
        .update({
          session_id: baileysSessionId,
          status: 'creating_session',
          provider_name: 'baileys',
          qr_code_url: null,
          phone_number: null,
          error_message: null,
          last_connected_at: null,
        })
        .eq('id', existing.id)
        .select()
        .maybeSingle();

      if (updateError || !updated) {
        return NextResponse.json(
          { error: updateError?.message || 'Failed to reset WhatsApp session' },
          { status: 500, headers: CORS }
        );
      }

      dbSessionId = updated.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from('whatsapp_sessions')
        .insert({
          business_id: businessId,
          connection_method: 'qr_code',
          session_id: baileysSessionId,
          status: 'creating_session',
          provider_name: 'baileys',
          qr_code_url: null,
          phone_number: null,
          error_message: null,
        })
        .select()
        .maybeSingle();

      if (createError || !created) {
        return NextResponse.json(
          { error: createError?.message || 'Failed to create WhatsApp session' },
          { status: 500, headers: CORS }
        );
      }

      dbSessionId = created.id;
    }

    const serviceRes = await fetch(`${serviceUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: baileysSessionId }),
      cache: 'no-store',
    });

    const rawText = await serviceRes.text().catch(() => '');
    let serviceData: {
      qrCode?: string | null;
      qr?: string | null;
      status?: string;
      phone?: string | null;
      phoneNumber?: string | null;
      error?: string;
    } = {};

    if (rawText.trim()) {
      try {
        serviceData = JSON.parse(rawText);
      } catch {
        serviceData = {};
      }
    }

    if (!serviceRes.ok) {
      const errorMessage =
        serviceData.error ||
        `Baileys service returned ${serviceRes.status}`;

      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'error', error_message: errorMessage })
        .eq('id', dbSessionId);

      return NextResponse.json(
        { error: errorMessage, session_id: dbSessionId, status: 'error' },
        { status: 502, headers: CORS }
      );
    }

    const qrCode = serviceData.qrCode ?? serviceData.qr ?? null;
    const phone = serviceData.phone ?? serviceData.phoneNumber ?? null;
    const dbStatus = qrCode ? 'waiting_for_scan' : 'generating_qr';

    await supabase
      .from('whatsapp_sessions')
      .update({
        qr_code_url: qrCode,
        status: dbStatus,
        phone_number: phone,
        error_message: null,
      })
      .eq('id', dbSessionId);

    return NextResponse.json({
      session_id: dbSessionId,
      baileys_session_id: baileysSessionId,
      qr_code: qrCode,
      status: dbStatus,
    }, { headers: CORS });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to start WhatsApp QR connection';

    if (dbSessionId) {
      try {
        const supabase = createServiceClient();
        await supabase
          .from('whatsapp_sessions')
          .update({ status: 'error', error_message: errorMessage })
          .eq('id', dbSessionId);
      } catch {
        // Preserve the original error response.
      }
    }

    return NextResponse.json(
      { error: errorMessage, session_id: dbSessionId, status: 'error' },
      { status: 503, headers: CORS }
    );
  }
}
