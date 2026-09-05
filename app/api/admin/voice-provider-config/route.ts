import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function testVoicebox(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(normalized, { signal: controller.signal, cache: 'no-store' });
    const raw = await response.text();
    let payload: { message?: string; version?: string } = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) {
      return { ok: false, message: `Voicebox returned HTTP ${response.status}` };
    }
    if (payload.message !== 'voicebox API') {
      return { ok: false, message: 'Reachable URL did not return the expected Voicebox API response' };
    }
    return { ok: true, message: `Voicebox connected successfully (v${payload.version || 'unknown'})` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unable to reach Voicebox' };
  } finally {
    clearTimeout(timer);
  }
}


export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    configId?: string;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    displayName?: string;
    isEnabled?: boolean;
  };

  if (!body.configId) return NextResponse.json({ error: 'Missing configId' }, { status: 400 });

  const { data: existing, error: existingError } = await supabase
    .from('voice_provider_configs')
    .select('provider')
    .eq('id', body.configId)
    .maybeSingle();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message || 'Voice provider configuration not found' }, { status: 404 });
  }

  const isVoicebox = existing.provider === 'voicebox';
  const update: Record<string, unknown> = {
    base_url: body.baseUrl?.trim() || (isVoicebox ? '' : 'https://api.elevenlabs.io'),
    model: body.model?.trim() || (isVoicebox ? 'chatterbox' : 'eleven_flash_v2_5'),
    display_name: body.displayName?.trim() || (isVoicebox ? 'Voicebox' : 'ElevenLabs'),
    is_enabled: body.isEnabled === true,
  };

  if (body.apiKey?.trim() && !isVoicebox) update.api_key_encrypted = body.apiKey.trim();

  const { error } = await supabase
    .from('voice_provider_configs')
    .update(update)
    .eq('id', body.configId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isVoicebox && body.isEnabled === true) {
    const baseUrl = String(update.base_url || '').trim();
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
      return NextResponse.json({ error: 'Voicebox requires a reachable HTTPS server URL' }, { status: 400 });
    }

    const test = await testVoicebox(baseUrl);
    await supabase
      .from('voice_provider_configs')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: test.ok ? 'success' : 'failed',
        last_test_message: test.message,
      })
      .eq('id', body.configId);

    if (!test.ok) {
      return NextResponse.json({ error: `Voicebox connection test failed: ${test.message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('voice_provider_configs')
    .select('id, provider, display_name, api_key_encrypted, base_url, model, is_enabled, last_tested_at, last_test_status, last_test_message')
    .order('provider');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    providers: (data || []).map((row) => ({
      ...row,
      api_key_encrypted: row.api_key_encrypted ? 'configured' : null,
    })),
  });
}
