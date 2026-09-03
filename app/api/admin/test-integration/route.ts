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
  const body = await req.json() as { integrationId: string; type: string };
  const { integrationId, type } = body;

  if (!integrationId || !type) {
    return NextResponse.json({ error: 'Missing integrationId or type' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, business_id, type, status, config')
    .eq('id', integrationId)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404, headers: CORS });
  }

  const config = (integration.config ?? {}) as Record<string, unknown>;
  let success = false;
  let message = '';

  try {
    if (type === 'whatsapp' || type === 'facebook_messenger' || type === 'instagram') {
      const token = (config.access_token as string) || (config.page_access_token as string);
      if (!token) {
        message = 'No access token configured.';
      } else {
        const id = type === 'whatsapp'
          ? config.phone_number_id
          : config.page_id || config.instagram_account_id;

        if (!id) {
          message = 'Missing required ID field.';
        } else {
          const url = `https://graph.facebook.com/v18.0/${id}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            success = true;
            message = 'Connection verified successfully.';
          } else {
            const body = await res.text();
            let msg = `${res.status}`;
            try { msg = JSON.parse(body).error?.message ?? msg; } catch { /* ignore */ }
            message = `API error: ${msg}`;
          }
        }
      }
    } else if (type === 'linkedin') {
      const token = config.access_token as string;
      if (!token) {
        message = 'No access token configured.';
      } else {
        const res = await fetch('https://api.linkedin.com/v2/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        success = res.ok;
        if (res.ok) {
          message = 'Connection verified successfully.';
        } else {
          const body = await res.text();
          let msg = `${res.status}`;
          try { msg = JSON.parse(body).message ?? msg; } catch { /* ignore */ }
          message = `API error: ${msg}`;
        }
      }
    } else {
      message = 'Test not available for this channel.';
    }
  } catch (err) {
    message = `Request failed: ${(err as Error).message}`;
  }

  if (success) {
    await supabase
      .from('integrations')
      .update({ status: 'configured' })
      .eq('id', integrationId);
  } else {
    await supabase
      .from('integrations')
      .update({ status: 'error' })
      .eq('id', integrationId);
  }

  return NextResponse.json({ success, message }, { headers: CORS });
}
