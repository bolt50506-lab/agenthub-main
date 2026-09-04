import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function requireManager(req: NextRequest, businessId: string) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Unauthorized', status: 401 as const };

  const supabase = createServiceClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return { error: 'Unauthorized', status: 401 as const };

  const userId = userData.user.id;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle(),
    supabase.from('business_members').select('role, status').eq('business_id', businessId).eq('user_id', userId).maybeSingle(),
  ]);

  if (
    profile?.is_super_admin !== true &&
    !(membership?.status === 'active' && ['owner', 'admin'].includes(membership.role))
  ) {
    return { error: 'Forbidden', status: 403 as const };
  }

  return { supabase };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const makeDefault = body?.isDefault === true;

  const service = createServiceClient();
  const { data: voice } = await service
    .from('voice_profiles')
    .select('id, business_id, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!voice) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 });

  const auth = await requireManager(req, voice.business_id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (makeDefault && voice.status !== 'active') {
    return NextResponse.json({ error: 'Only active voices can be set as default' }, { status: 400 });
  }

  if (makeDefault) {
    await auth.supabase
      .from('voice_profiles')
      .update({ is_default: false })
      .eq('business_id', voice.business_id)
      .eq('is_default', true);

    const { data, error } = await auth.supabase
      .from('voice_profiles')
      .update({ is_default: true })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, voice: data });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const service = createServiceClient();
  const { data: voice } = await service
    .from('voice_profiles')
    .select('id, business_id, provider, provider_voice_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!voice) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 });

  const auth = await requireManager(req, voice.business_id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (voice.provider === 'voicebox') {
    const { data: config } = await auth.supabase
      .from('voice_provider_configs')
      .select('base_url')
      .eq('provider', 'voicebox')
      .maybeSingle();

    const baseUrl = (config?.base_url || '').replace(/\/$/, '');
    if (baseUrl) {
      const providerResponse = await fetch(
        `${baseUrl}/profiles/${encodeURIComponent(voice.provider_voice_id)}`,
        { method: 'DELETE' }
      ).catch(() => null);

      // Allow AgentHub cleanup if the remote/local profile is already gone.
      if (providerResponse && !providerResponse.ok && providerResponse.status !== 404) {
        const text = await providerResponse.text();
        return NextResponse.json(
          { error: 'Voicebox profile deletion failed', details: text.slice(0, 500) },
          { status: 502 }
        );
      }
    }
  }

  if (voice.provider === 'elevenlabs') {
    const { data: config } = await auth.supabase
      .from('voice_provider_configs')
      .select('api_key_encrypted, base_url')
      .eq('provider', 'elevenlabs')
      .maybeSingle();

    if (config?.api_key_encrypted) {
      const baseUrl = (config.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
      const providerResponse = await fetch(
        `${baseUrl}/v1/voices/${encodeURIComponent(voice.provider_voice_id)}`,
        {
          method: 'DELETE',
          headers: { 'xi-api-key': config.api_key_encrypted },
        }
      );

      // If the provider no longer has the voice, still allow local cleanup.
      if (!providerResponse.ok && providerResponse.status !== 404) {
        const text = await providerResponse.text();
        return NextResponse.json(
          { error: 'Voice provider deletion failed', details: text.slice(0, 500) },
          { status: 502 }
        );
      }
    }
  }

  const { error } = await auth.supabase.from('voice_profiles').delete().eq('id', voice.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
