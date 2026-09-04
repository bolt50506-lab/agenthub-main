import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    displayName?: string;
    isEnabled?: boolean;
  };

  if (!body.configId) return NextResponse.json({ error: 'Missing configId' }, { status: 400 });

  const update: Record<string, unknown> = {
    base_url: body.baseUrl || 'https://api.elevenlabs.io',
    model: body.model || 'eleven_flash_v2_5',
    display_name: body.displayName || 'ElevenLabs',
    is_enabled: body.isEnabled === true,
  };

  if (body.apiKey?.trim()) update.api_key_encrypted = body.apiKey.trim();

  const { error } = await supabase
    .from('voice_provider_configs')
    .update(update)
    .eq('id', body.configId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
