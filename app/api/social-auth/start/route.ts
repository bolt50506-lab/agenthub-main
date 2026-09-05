import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://agenthubai.vercel.app').replace(/\/$/, '');
const STATE_SECRET = process.env.SOCIAL_OAUTH_STATE_SECRET || '';

function sign(payload: string) {
  return crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!META_APP_ID || !META_APP_SECRET || !STATE_SECRET) {
      return NextResponse.json({ error: 'Meta OAuth is not configured. Add META_APP_ID, META_APP_SECRET and SOCIAL_OAUTH_STATE_SECRET.' }, { status: 503 });
    }

    const body = await req.json();
    const provider = body.provider === 'instagram' ? 'instagram' : 'facebook';
    const businessId = String(body.businessId || '');
    if (!businessId) return NextResponse.json({ error: 'businessId is required' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResult.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('business_id', businessId)
      .eq('user_id', userResult.user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'You do not have access to this business' }, { status: 403 });

    const nonce = crypto.randomBytes(18).toString('hex');
    const expires = Date.now() + 10 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ provider, businessId, userId: userResult.user.id, nonce, expires })).toString('base64url');
    const state = payload + '.' + sign(payload);

    const redirectUri = provider === 'instagram'
      ? APP_URL + '/api/social-auth/callback/instagram'
      : APP_URL + '/api/social-auth/callback/facebook';

    // Facebook Login is also used for Page discovery. Instagram professional accounts
    // connected to a selected Page are returned after login and can be selected separately.
    const scope = provider === 'instagram'
      ? 'instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement'
      : 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_messages';

    const url = 'https://www.facebook.com/v22.0/dialog/oauth?' + new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
    }).toString();

    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start social login' }, { status: 500 });
  }
}
