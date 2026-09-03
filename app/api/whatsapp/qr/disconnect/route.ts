import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS,
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: { business_id?: string };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON request body',
        },
        {
          status: 400,
          headers: CORS,
        }
      );
    }

    const businessId = body?.business_id?.trim();

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing business_id',
        },
        {
          status: 400,
          headers: CORS,
        }
      );
    }

    const supabase = createServiceClient();

    /*
     * Find the QR WhatsApp session for this business.
     */
    const { data: session, error: sessionLookupError } =
      await supabase
        .from('whatsapp_sessions')
        .select('id, session_id, status')
        .eq('business_id', businessId)
        .eq('connection_method', 'qr_code')
        .maybeSingle();

    if (sessionLookupError) {
      console.error(
        '[QR Disconnect] Failed to find session:',
        sessionLookupError
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to find WhatsApp QR session',
          details: sessionLookupError.message,
        },
        {
          status: 500,
          headers: CORS,
        }
      );
    }

    /*
     * Disconnect the actual Baileys session.
     */
    let serviceDisconnected = false;

    if (session?.session_id) {
      const serviceUrl =
        process.env.WHATSAPP_QR_SERVICE_URL ||
        'http://localhost:3001';

      const cleanServiceUrl =
        serviceUrl.replace(/\/+$/, '');

      try {
        const response = await fetch(
          `${cleanServiceUrl}/sessions/${encodeURIComponent(
            session.session_id
          )}`,
          {
            method: 'DELETE',
            cache: 'no-store',
          }
        );

        const responseText =
          await response.text().catch(() => '');

        console.log(
          '[QR Disconnect] Baileys service response:',
          response.status,
          responseText
        );

        /*
         * Treat both 200 and 404 as effectively disconnected.
         *
         * 404 simply means the in-memory Node session was
         * already gone.
         */
        if (response.ok || response.status === 404) {
          serviceDisconnected = true;
        }
      } catch (error) {
        console.error(
          '[QR Disconnect] Failed to reach Baileys service:',
          error
        );

        /*
         * Continue with Supabase cleanup.
         * The local service may already be stopped or the
         * session may already have disappeared.
         */
      }
    } else {
      /*
       * There is no Baileys session ID, so there is nothing
       * to disconnect from the local service.
       */
      serviceDisconnected = true;
    }

    /*
     * Mark the Supabase WhatsApp session as disconnected.
     */
    const { error: updateSessionError } =
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'disconnected',
          qr_code_url: null,
          error_message: null,
        })
        .eq('business_id', businessId)
        .eq('connection_method', 'qr_code');

    if (updateSessionError) {
      console.error(
        '[QR Disconnect] Failed updating WhatsApp session:',
        updateSessionError
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update WhatsApp session',
          details: updateSessionError.message,
          service_disconnected: serviceDisconnected,
        },
        {
          status: 500,
          headers: CORS,
        }
      );
    }

    /*
     * Mark the main WhatsApp integration as disconnected.
     */
    const { error: integrationError } =
      await supabase
        .from('integrations')
        .update({
          status: 'not_connected',
        })
        .eq('business_id', businessId)
        .eq('type', 'whatsapp');

    if (integrationError) {
      console.error(
        '[QR Disconnect] Failed updating integration:',
        integrationError
      );
    }

    console.log(
      `[QR Disconnect] WhatsApp disconnected for business ${businessId}`
    );

    return NextResponse.json(
      {
        success: true,
        message: 'WhatsApp disconnected successfully',
        service_disconnected: serviceDisconnected,
      },
      {
        status: 200,
        headers: CORS,
      }
    );
  } catch (error) {
    console.error(
      '[QR Disconnect] Unexpected error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
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