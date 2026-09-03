import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const WHATSAPP_QR_SERVICE_URL =
  process.env.WHATSAPP_QR_SERVICE_URL || 'http://localhost:3001';

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: CORS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      session_id?: string;
      phone_number?: string;
      business_id?: string;
    };

    const { session_id, phone_number, business_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400, headers: CORS }
      );
    }

    const supabase = createServiceClient();

    /*
     * Find the existing AgentHub WhatsApp session.
     */
    let sessionQuery = supabase
      .from('whatsapp_sessions')
      .select(
        'id, business_id, session_id, status, connection_method, phone_number'
      )
      .eq('session_id', session_id);

    if (business_id) {
      sessionQuery = sessionQuery.eq('business_id', business_id);
    }

    const { data: session, error: sessionError } =
      await sessionQuery.maybeSingle();

    if (sessionError) {
      console.error(
        'Supabase session lookup error:',
        sessionError.message
      );

      return NextResponse.json(
        {
          error: 'Failed to find WhatsApp session',
          details: sessionError.message,
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
          session_id,
        },
        {
          status: 404,
          headers: CORS,
        }
      );
    }

    /*
     * If already connected, do not create another Baileys session.
     */
    if (session.status === 'connected') {
      return NextResponse.json(
        {
          success: true,
          sessionId: session_id,
          status: 'connected',
          message: 'WhatsApp already connected',
        },
        {
          headers: CORS,
        }
      );
    }

    /*
     * IMPORTANT:
     * Start the REAL WhatsApp QR session on the Node/Baileys
     * service running on port 3001.
     */
    console.log(
      `Starting WhatsApp QR session: ${session_id}`
    );

    let serviceResponse: Response;

    try {
      serviceResponse = await fetch(
        `${WHATSAPP_QR_SERVICE_URL}/sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: session_id,
          }),
          cache: 'no-store',
        }
      );
    } catch (error) {
      console.error(
        'WhatsApp QR service connection failed:',
        error
      );

      return NextResponse.json(
        {
          error:
            'WhatsApp QR service could not be reached. Make sure the service is running on port 3001.',
          service_url: WHATSAPP_QR_SERVICE_URL,
        },
        {
          status: 503,
          headers: CORS,
        }
      );
    }

    const serviceText = await serviceResponse.text();

    let serviceData: any = null;

    try {
      serviceData = JSON.parse(serviceText);
    } catch {
      serviceData = {
        raw: serviceText,
      };
    }

    console.log(
      'WhatsApp QR service response:',
      serviceResponse.status,
      serviceData
    );

    if (!serviceResponse.ok || serviceData?.success === false) {
      return NextResponse.json(
        {
          error:
            serviceData?.error ||
            'WhatsApp QR service failed to create session',
          session_id,
          service_status: serviceResponse.status,
          service_response: serviceData,
        },
        {
          status: 502,
          headers: CORS,
        }
      );
    }

    /*
     * The Node service initially returns "connecting".
     * Baileys generates the real QR asynchronously.
     *
     * Therefore we DO NOT mark the Supabase session as connected here.
     */
    await supabase
      .from('whatsapp_sessions')
      .update({
        status: 'connecting',
        phone_number: phone_number || null,
        error_message: null,
      })
      .eq('id', session.id);

    /*
     * Return the actual session information from the QR service.
     * The frontend should continue polling the status endpoint.
     */
    return NextResponse.json(
      {
        success: true,
        sessionId: session_id,
        status: serviceData?.status || 'connecting',
        qrCode: serviceData?.qrCode || null,
        phoneNumber: serviceData?.phoneNumber || null,
        error: serviceData?.error || null,
        serviceUrl: WHATSAPP_QR_SERVICE_URL,
      },
      {
        headers: CORS,
      }
    );
  } catch (error) {
    console.error(
      'WhatsApp QR connect route error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Internal server error',
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
        headers: CORS,
      }
    );
  }
}