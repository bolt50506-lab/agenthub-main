import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: CORS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      session_id: string;
    };

    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        {
          error: 'Missing session_id',
        },
        {
          status: 400,
          headers: CORS,
        }
      );
    }

    const supabase = createServiceClient();

    /*
     * Get the WhatsApp session from Supabase.
     */
    const { data: session, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select(`
        id,
        business_id,
        session_id,
        status,
        qr_code_url,
        phone_number,
        error_message,
        last_connected_at
      `)
      .eq('id', session_id)
      .maybeSingle();

    if (sessionError) {
      console.error('Supabase session lookup error:', sessionError);

      return NextResponse.json(
        {
          error: sessionError.message,
        },
        {
          status: 500,
          headers: CORS,
        }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          error: 'Session not found',
        },
        {
          status: 404,
          headers: CORS,
        }
      );
    }

    /*
     * IMPORTANT:
     *
     * Always ask the Baileys service for the real status.
     *
     * Do NOT trust the old Supabase status here because
     * the WhatsApp service may have connected after the
     * QR was scanned.
     */

    const serviceUrl =
      process.env.WHATSAPP_QR_SERVICE_URL ||
      'http://localhost:3001';

    const baileysSessionId = session.session_id;

    if (!baileysSessionId) {
      return NextResponse.json(
        {
          session_id: session.id,
          status: session.status,
          qr_code: session.qr_code_url,
          phone_number: session.phone_number,
          error_message:
            'No Baileys session ID associated with this session.',
          connected_at: session.last_connected_at,
        },
        {
          headers: CORS,
        }
      );
    }

    console.log(
      `Checking WhatsApp status for: ${baileysSessionId}`
    );

    const serviceRes = await fetch(
      `${serviceUrl}/sessions/${baileysSessionId}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (!serviceRes.ok) {
      const errorText = await serviceRes
        .text()
        .catch(() => '');

      console.error(
        'WhatsApp service error:',
        serviceRes.status,
        errorText
      );

      /*
       * IMPORTANT: a 404 here means the WhatsApp service has no memory
       * of this session at all - most commonly because the Node
       * service restarted and its in-memory session map was cleared.
       * The old Supabase status (which might say "connected") is now a
       * lie. Mark it stale so the dashboard shows an honest
       * "disconnected" state and offers to start a fresh session,
       * instead of repeating a status that can no longer be true.
       */

      if (serviceRes.status === 404) {
        const { error: staleUpdateError } = await supabase
          .from('whatsapp_sessions')
          .update({
            status: 'disconnected',
            qr_code_url: null,
            error_message:
              'WhatsApp service lost this session (likely restarted). Start a new QR session.',
          })
          .eq('id', session.id);

        if (staleUpdateError) {
          console.error(
            'Failed marking stale session disconnected:',
            staleUpdateError
          );
        }

        return NextResponse.json(
          {
            session_id: session.id,
            status: 'disconnected',
            qr_code: null,
            phone_number: session.phone_number,
            error_message:
              'WhatsApp service lost this session (likely restarted). Start a new QR session.',
            connected_at: session.last_connected_at,
            stale: true,
          },
          {
            headers: CORS,
          }
        );
      }

      return NextResponse.json(
        {
          session_id: session.id,
          status: session.status,
          qr_code: session.qr_code_url,
          phone_number: session.phone_number,
          error_message:
            `WhatsApp service returned ${serviceRes.status}`,
          connected_at: session.last_connected_at,
        },
        {
          headers: CORS,
        }
      );
    }

    const rawText = await serviceRes.text();

    console.log(
      'WhatsApp service response:',
      rawText
    );

    let serviceData: {
      success?: boolean;
      sessionId?: string;
      status?: string;
      qrCode?: string | null;
      qr?: string | null;
      phone?: string | null;
      phoneNumber?: string | null;
      error?: string | null;
    } = {};

    if (rawText.trim()) {
      try {
        serviceData = JSON.parse(rawText);
      } catch (error) {
        console.error(
          'Failed to parse WhatsApp service response:',
          error
        );
      }
    }

    const serviceStatus =
      serviceData.status?.toLowerCase() || '';

    const qrCode =
      serviceData.qrCode ??
      serviceData.qr ??
      session.qr_code_url ??
      null;

    const phone =
      serviceData.phone ??
      serviceData.phoneNumber ??
      session.phone_number ??
      null;

    let dbStatus = session.status;

    /*
     * Status mapping.
     */

    if (
      serviceStatus === 'connected' ||
      serviceStatus === 'open' ||
      serviceStatus === 'authenticated'
    ) {
      dbStatus = 'connected';
    }

    else if (
      serviceStatus === 'waiting_for_scan' ||
      serviceStatus === 'waiting' ||
      serviceStatus === 'qr'
    ) {
      dbStatus = 'waiting_for_scan';
    }

    else if (
      serviceStatus === 'connecting' ||
      serviceStatus === 'loading' ||
      serviceStatus === 'creating_session'
    ) {
      dbStatus = 'connecting';
    }

    else if (
      serviceStatus === 'disconnected' ||
      serviceStatus === 'closed' ||
      serviceStatus === 'logged_out'
    ) {
      dbStatus = 'disconnected';
    }

    else if (
      serviceStatus === 'error' ||
      serviceStatus === 'failed'
    ) {
      dbStatus = 'error';
    }

    console.log(
      `WhatsApp session ${session.id}: ${session.status} -> ${dbStatus}`
    );

    /*
     * Update Supabase.
     */

    const updateData: Record<string, unknown> = {
      status: dbStatus,
    };

    if (qrCode) {
      updateData.qr_code_url = qrCode;
    }

    if (phone) {
      updateData.phone_number = phone;
    }

    if (dbStatus === 'connected') {
      updateData.last_connected_at =
        new Date().toISOString();

      updateData.error_message = null;
    }

    if (serviceData.error) {
      updateData.error_message =
        serviceData.error;
    }

    const { error: updateError } = await supabase
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('id', session.id);

    if (updateError) {
      console.error(
        'Failed updating WhatsApp session:',
        updateError
      );
    }

    /*
     * When WhatsApp becomes connected,
     * update/create the integration record.
     */

    if (dbStatus === 'connected') {

      const now =
        new Date().toISOString();

      const { data: existingIntegration } =
        await supabase
          .from('integrations')
          .select('id')
          .eq(
            'business_id',
            session.business_id
          )
          .eq(
            'type',
            'whatsapp'
          )
          .maybeSingle();

      if (existingIntegration) {

        const { error: integrationError } =
          await supabase
            .from('integrations')
            .update({
              status: 'connected',
              last_connected_at: now,
              config: {
                connection_method: 'qr_code',
                phone_number: phone,
              },
            })
            .eq(
              'id',
              existingIntegration.id
            );

        if (integrationError) {
          console.error(
            'Failed updating integration:',
            integrationError
          );
        }

      } else {

        const { error: integrationError } =
          await supabase
            .from('integrations')
            .insert({
              business_id:
                session.business_id,

              type:
                'whatsapp',

              name:
                'WhatsApp (QR)',

              status:
                'connected',

              config: {
                connection_method:
                  'qr_code',

                phone_number:
                  phone,
              },

              last_connected_at:
                now,
            });

        if (integrationError) {
          console.error(
            'Failed creating integration:',
            integrationError
          );
        }
      }
    }

    /*
     * Return the real status to dashboard.
     */

    return NextResponse.json(
      {
        session_id:
          session.id,

        status:
          dbStatus,

        qr_code:
          qrCode,

        phone_number:
          phone,

        error_message:
          serviceData.error ??
          null,

        connected_at:
          dbStatus === 'connected'
            ? new Date().toISOString()
            : session.last_connected_at,
      },
      {
        headers:
          CORS,
      }
    );

  } catch (error) {

    console.error(
      'WhatsApp QR status API error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown server error',
      },
      {
        status: 500,
        headers: CORS,
      }
    );
  }
}