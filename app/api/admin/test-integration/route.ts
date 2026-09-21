import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const META_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';

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
  let diagnostics: Record<string, unknown> | undefined;

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
        } else if (type === 'instagram') {
          const igId = String(config.instagram_account_id || '');
          const igUrl = `https://graph.instagram.com/${META_VERSION}/${encodeURIComponent(igId)}?fields=id,username`;
          const igRes = await fetch(igUrl, {
            headers: { Authorization: 'Bearer ' + token },
          });
          const igData = await igRes.json().catch(() => ({}));

          diagnostics = {
            apiHost: 'graph.instagram.com',
            apiVersion: META_VERSION,
            instagramAccountId: igId,
            account: igRes.ok
              ? { id: igData?.id ?? null, username: igData?.username ?? null }
              : null,
            accountHttpStatus: igRes.status,
          };

          if (igRes.ok && String(igData?.id || '') === igId) {
            const subscribeRes = await fetch(
              `https://graph.instagram.com/${META_VERSION}/${encodeURIComponent(igId)}/subscribed_apps`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  subscribed_fields: 'messages',
                  access_token: token,
                }).toString(),
              },
            );
            const subscribeData = await subscribeRes.json().catch(() => ({}));

            diagnostics = {
              ...diagnostics,
              subscribeHttpStatus: subscribeRes.status,
              subscribeResponse: subscribeData,
            };

            if (!subscribeRes.ok || subscribeData?.error) {
              const subscribeMessage =
                subscribeData?.error?.message ||
                subscribeData?.error?.error_user_msg ||
                `HTTP ${subscribeRes.status}`;
              message = `Instagram account verified, but webhook subscription failed: ${subscribeMessage}`;
              success = false;
            } else {
              // Read the subscription back from Meta. This is the important
              // diagnostic: a successful POST alone does not prove that the
              // Instagram account is currently subscribed to messages.
              const checkRes = await fetch(
                `https://graph.instagram.com/${META_VERSION}/${encodeURIComponent(igId)}/subscribed_apps`,
                {
                  headers: { Authorization: 'Bearer ' + token },
                },
              );
              const checkData = await checkRes.json().catch(() => ({}));

              const subscriptions = Array.isArray(checkData?.data) ? checkData.data : [];
              const messageSubscriptions = subscriptions.filter((item: any) =>
                Array.isArray(item?.subscribed_fields) &&
                item.subscribed_fields.includes('messages'),
              );
              const messagesSubscribed = messageSubscriptions.length > 0 ||
                subscriptions.some((item: any) =>
                  Array.isArray(item?.fields) && item.fields.includes('messages'),
                );

              diagnostics = {
                ...diagnostics,
                subscriptionCheckHttpStatus: checkRes.status,
                subscriptionCheckResponse: checkData,
                messagesSubscribed,
              };

              if (!checkRes.ok || checkData?.error) {
                const checkMessage =
                  checkData?.error?.message ||
                  checkData?.error?.error_user_msg ||
                  `HTTP ${checkRes.status}`;
                success = false;
                message = `Instagram account verified, but Meta could not confirm the account webhook subscription: ${checkMessage}`;
              } else if (!messagesSubscribed) {
                success = false;
                message = 'Instagram account verified, but Meta reports that the account is NOT subscribed to the messages webhook.';
              } else {
                success = true;
                message = 'Instagram connection verified. Meta confirms the Instagram account is subscribed to the messages webhook.';
              }
            }
          } else {
            const graphMessage =
              igData?.error?.message ||
              igData?.error?.error_user_msg ||
              `HTTP ${igRes.status}`;
            message = `API error: ${graphMessage}`;
          }
        } else {
          const url = `https://graph.facebook.com/${META_VERSION}/${id}`;
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

  return NextResponse.json({ success, message, diagnostics }, { headers: CORS });
}
