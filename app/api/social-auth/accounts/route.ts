import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

const COOKIE_SECRET = process.env.SOCIAL_OAUTH_COOKIE_SECRET || process.env.SOCIAL_OAUTH_STATE_SECRET || '';

function decrypt(value: string) {
  const key = crypto.createHash('sha256').update(COOKIE_SECRET).digest();
  const raw = Buffer.from(value, 'base64url');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

async function auth(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.auth.getUser(token);
  return data.user || null;
}

function getSession(req: NextRequest, nonce: string) {
  const raw = req.cookies.get('agenthub_social_' + nonce)?.value;
  if (!raw || !COOKIE_SECRET) return null;
  try {
    const data = JSON.parse(decrypt(raw));
    return data.expires > Date.now() ? data : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const user = await auth(req);
  const nonce = new URL(req.url).searchParams.get('state') || '';
  const session = user && nonce ? getSession(req, nonce) : null;
  if (!user || !session || session.userId !== user.id) return NextResponse.json({ error: 'Social login session expired. Please login again.' }, { status: 401 });

  const targets = session.provider === 'facebook'
    ? session.pages.map((p: any) => ({ id: p.id, label: p.name, kind: 'facebook_page', picture: p.picture }))
    : session.pages.filter((p: any) => p.instagram).map((p: any) => ({ id: p.instagram.id, label: '@' + p.instagram.username, kind: 'instagram_profile', pageId: p.id }));

  return NextResponse.json({ provider: session.provider, targets });
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  const body = await req.json();
  const nonce = String(body.state || ''), targetId = String(body.targetId || '');
  const session = user && nonce ? getSession(req, nonce) : null;
  if (!user || !session || session.userId !== user.id) return NextResponse.json({ error: 'Social login session expired. Please login again.' }, { status: 401 });

  const supabase = createServiceClient();
  const type = session.provider === 'facebook' ? 'facebook_messenger' : 'instagram';
  const selectedPage = session.provider === 'facebook'
    ? session.pages.find((p: any) => p.id === targetId)
    : session.pages.find((p: any) => p.instagram?.id === targetId);
  if (!selectedPage) return NextResponse.json({ error: 'Selected account was not found' }, { status: 404 });

  const config = session.provider === 'facebook'
    ? { page_id: selectedPage.id, page_access_token: selectedPage.pageAccessToken, oauth_connected: true, oauth_provider: 'facebook' }
    : { instagram_account_id: selectedPage.instagram.id, facebook_page_id: selectedPage.id, access_token: selectedPage.pageAccessToken, oauth_connected: true, oauth_provider: 'instagram' };

  const { data: existing } = await supabase.from('integrations')
    .select('id').eq('business_id', session.businessId).eq('type', type).maybeSingle();

  const payload = { business_id: session.businessId, type, name: session.provider === 'facebook' ? selectedPage.name : '@' + selectedPage.instagram.username, status: 'configuration_required', config };
  const result = existing
    ? await supabase.from('integrations').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('integrations').insert(payload).select().single();

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const response = NextResponse.json({ success: true, integration: result.data });
  response.cookies.set('agenthub_social_' + nonce, '', { path: '/', maxAge: 0 });
  return response;
}
