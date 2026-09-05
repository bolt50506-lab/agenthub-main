import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://agenthubai.vercel.app').replace(/\/$/, '');
const STATE_SECRET = process.env.SOCIAL_OAUTH_STATE_SECRET || '';
const COOKIE_SECRET = process.env.SOCIAL_OAUTH_COOKIE_SECRET || STATE_SECRET;

function sign(payload: string) { return crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex'); }
function encrypt(value: string) {
  const key = crypto.createHash('sha256').update(COOKIE_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

async function callback(req: NextRequest, provider: 'facebook' | 'instagram') {
  const url = new URL(req.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  if (error || !code || !state.includes('.')) {
    return NextResponse.redirect(APP_URL + '/dashboard/integrations?social_error=' + encodeURIComponent(error || 'Social login was cancelled'));
  }

  const [payload, signature] = state.split('.');
  if (!STATE_SECRET || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) {
    return NextResponse.redirect(APP_URL + '/dashboard/integrations?social_error=Invalid%20social%20login%20state');
  }

  let decoded: { provider: string; businessId: string; userId: string; nonce: string; expires: number };
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch {
    return NextResponse.redirect(APP_URL + '/dashboard/integrations?social_error=Invalid%20social%20login%20state');
  }
  if (decoded.provider !== provider || decoded.expires < Date.now()) {
    return NextResponse.redirect(APP_URL + '/dashboard/integrations?social_error=Social%20login%20expired');
  }

  const redirectUri = APP_URL + '/api/social-auth/callback/' + provider;
  const tokenRes = await fetch('https://graph.facebook.com/v22.0/oauth/access_token?' + new URLSearchParams({
    client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: redirectUri, code,
  }), { cache: 'no-store' });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    return NextResponse.redirect(APP_URL + '/dashboard/integrations?social_error=' + encodeURIComponent(tokenData.error?.message || 'Could not complete Meta login'));
  }

  const accountsRes = await fetch('https://graph.facebook.com/v22.0/me/accounts?' + new URLSearchParams({
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name}',
    access_token: tokenData.access_token,
  }), { cache: 'no-store' });
  const accountsData = await accountsRes.json();
  const pages = Array.isArray(accountsData.data) ? accountsData.data.map((p: any) => ({
    id: String(p.id), name: p.name || 'Facebook Page', picture: p.picture?.data?.url || null,
    pageAccessToken: p.access_token || null,
    instagram: p.instagram_business_account ? {
      id: String(p.instagram_business_account.id),
      username: p.instagram_business_account.username || p.instagram_business_account.name || 'Instagram account',
    } : null,
  })) : [];

  const socialSession = encrypt(JSON.stringify({
    businessId: decoded.businessId,
    userId: decoded.userId,
    provider,
    pages,
    userAccessToken: tokenData.access_token,
    expires: Date.now() + 15 * 60 * 1000,
  }));

  const response = NextResponse.redirect(APP_URL + '/dashboard/integrations?social_login=' + provider + '&social_state=' + encodeURIComponent(decoded.nonce));
  response.cookies.set('agenthub_social_' + decoded.nonce, socialSession, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 15 * 60,
  });
  return response;
}

export async function GET(req: NextRequest) { return callback(req, 'instagram'); }
