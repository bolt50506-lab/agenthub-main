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
          // Support both Meta authentication paths used for Page-connected
          // Instagram accounts: direct Instagram tokens and Facebook
          // user/Page tokens. Do not treat a valid Page token as an
          // Instagram-user token, which causes "Unsupported get request".
          const igId = String(config.instagram_account_id);

          const directUrl = `https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(igId)}?fields=id,username`;
          const directRes = await fetch(directUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (directRes.ok) {
            const directData = await directRes.json().catch(() => ({}));
            success = String(directData?.id || '') === igId;
            message = success
              ? 'Instagram connection verified successfully.'
              : 'Instagram account ID could not be verified.';
          } else {
            // First determine what object the supplied token represents.
            const meRes = await fetch(`https://graph.facebook.com/${META_VERSION}/me?fields=id,name`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const meData = await meRes.json().catch(() => ({}));
            const meId = String(meData?.id || '');
            let pageData: any = {};

            // A Page access token resolves /me to the Page. Check the
            // Page-linked Instagram Business Account directly.
            if (meId) {
              const pageRes = await fetch(
                `https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(meId)}?fields=id,name,instagram_business_account{id,username}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              pageData = await pageRes.json().catch(() => ({}));
              const pageIgId = String(pageData?.instagram_business_account?.id || '');

              if (pageIgId === igId) {
                success = true;
                message = 'Instagram connection verified through the connected Facebook Page.';
                const mergedConfig = { ...config, page_id: meId, page_access_token: token };
                await supabase.from('integrations').update({ config: mergedConfig }).eq('id', integrationId);
              }
            }

            // A Facebook user token resolves /me to the user. Discover the
            // Pages they manage and their linked Instagram account.
            if (!success) {
              const accountsUrl = `https://graph.facebook.com/${META_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`;
              const accountsRes = await fetch(accountsUrl, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const accountsData = await accountsRes.json().catch(() => ({}));
              const pages = Array.isArray(accountsData?.data) ? accountsData.data : [];
              const matchedPage = pages.find((page: any) =>
                String(page?.instagram_business_account?.id || '') === igId
              );

              if (matchedPage) {
                success = true;
                message = 'Instagram connection verified through the connected Facebook Page.';
                const mergedConfig = {
                  ...config,
                  page_id: String(matchedPage.id),
                  page_access_token: String(matchedPage.access_token || token),
                };
                await supabase.from('integrations').update({ config: mergedConfig }).eq('id', integrationId);
              } else {
                const directBody = await directRes.text().catch(() => '');
                const graphError = accountsData?.error?.message || pageData?.error?.message || meData?.error?.message || directBody || `HTTP ${directRes.status}`;
                message = `API error: ${graphError}`;
              }
            }
          }
        }        } else {
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

  return NextResponse.json({ success, message }, { headers: CORS });
}
