import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
]);

async function requireBusinessManager(req: NextRequest, businessId: string) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!token) {
    return { error: 'Unauthorized', status: 401 as const };
  }

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: 'Unauthorized', status: 401 as const };
  }

  const userId = userData.user.id;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle(),
    supabase
      .from('business_members')
      .select('role, status')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const allowed =
    profile?.is_super_admin === true ||
    (membership?.status === 'active' && ['owner', 'admin'].includes(membership.role));

  if (!allowed) {
    return { error: 'You do not have permission to manage voices for this business', status: 403 as const };
  }

  return { supabase, userId };
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('businessId')?.trim();

  if (!businessId) {
    return NextResponse.json({ error: 'Missing businessId' }, { status: 400 });
  }

  const auth = await requireBusinessManager(req, businessId);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  const [{ data: voices, error }, { data: limit }] = await Promise.all([
    supabase
      .from('voice_profiles')
      .select('id, business_id, name, description, provider, clone_type, status, requires_verification, is_default, preview_url, language, created_at, updated_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false }),
    supabase.rpc('check_plan_limit', {
      p_business_id: businessId,
      p_limit_type: 'max_voice_clones',
    }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    voices: voices ?? [],
    limit: limit ?? { allowed: false, current: 0, max: 0, limit_type: 'max_voice_clones' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const businessId = String(form.get('businessId') || '').trim();
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    const language = String(form.get('language') || '').trim() || null;
    const removeBackgroundNoise = String(form.get('removeBackgroundNoise') || 'false') === 'true';
    const consent = String(form.get('consent') || 'false') === 'true';
    const files = form
      .getAll('files')
      .filter((value): value is File => value instanceof File);

    if (!businessId || !name) {
      return NextResponse.json({ error: 'Business and voice name are required' }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json(
        { error: 'You must confirm that you own the voice or have explicit permission to clone it' },
        { status: 400 }
      );
    }

    if (!files.length) {
      return NextResponse.json({ error: 'Upload at least one audio sample' }, { status: 400 });
    }

    if (files.some((file) => file.size <= 0 || file.size > MAX_AUDIO_BYTES)) {
      return NextResponse.json({ error: 'Each audio file must be between 1 byte and 25 MB' }, { status: 400 });
    }

    if (files.some((file) => file.type && !ALLOWED_AUDIO_TYPES.has(file.type))) {
      return NextResponse.json({ error: 'Unsupported audio format. Use MP3, WAV, OGG, WebM, M4A, or MP4 audio.' }, { status: 400 });
    }

    const auth = await requireBusinessManager(req, businessId);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, userId } = auth;

    const { data: limit, error: limitError } = await supabase.rpc('check_plan_limit', {
      p_business_id: businessId,
      p_limit_type: 'max_voice_clones',
    });

    if (limitError) {
      return NextResponse.json({ error: limitError.message }, { status: 500 });
    }

    if (!limit?.allowed) {
      return NextResponse.json(
        {
          error: 'Voice clone limit reached for your subscription plan',
          limit: limit ?? null,
        },
        { status: 403 }
      );
    }

    const { data: providerConfig, error: providerError } = await supabase
      .from('voice_provider_configs')
      .select('provider, api_key_encrypted, base_url, model, is_enabled')
      .eq('provider', 'elevenlabs')
      .maybeSingle();

    if (providerError || !providerConfig?.is_enabled || !providerConfig.api_key_encrypted) {
      return NextResponse.json(
        { error: 'Voice cloning is not configured by the platform administrator' },
        { status: 503 }
      );
    }

    const providerForm = new FormData();
    providerForm.set('name', name);
    if (description) providerForm.set('description', description);
    providerForm.set('remove_background_noise', String(removeBackgroundNoise));
    providerForm.set('labels', JSON.stringify({ language: language || 'multilingual', use_case: 'business' }));

    for (const file of files) {
      providerForm.append('files[]', file, file.name || 'voice-sample');
    }

    const baseUrl = (providerConfig.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
    const cloneResponse = await fetch(`${baseUrl}/v1/voices/add`, {
      method: 'POST',
      headers: {
        'xi-api-key': providerConfig.api_key_encrypted,
      },
      body: providerForm,
    });

    const raw = await cloneResponse.text();
    let cloneData: Record<string, unknown> = {};
    try {
      cloneData = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      cloneData = { raw };
    }

    if (!cloneResponse.ok || typeof cloneData.voice_id !== 'string') {
      const providerMessage =
        typeof cloneData.detail === 'string'
          ? cloneData.detail
          : typeof cloneData.message === 'string'
            ? cloneData.message
            : 'Voice provider rejected the clone request';

      return NextResponse.json({ error: providerMessage }, { status: 502 });
    }

    const voiceId = cloneData.voice_id;
    let previewUrl: string | null = null;

    try {
      const voiceInfoResponse = await fetch(`${baseUrl}/v1/voices/${encodeURIComponent(voiceId)}`, {
        headers: { 'xi-api-key': providerConfig.api_key_encrypted },
      });
      if (voiceInfoResponse.ok) {
        const voiceInfo = await voiceInfoResponse.json() as { preview_url?: string | null };
        previewUrl = voiceInfo.preview_url || null;
      }
    } catch {
      // Preview metadata is optional. A successful clone remains usable.
    }

    const { data: existingVoices } = await supabase
      .from('voice_profiles')
      .select('id')
      .eq('business_id', businessId)
      .neq('status', 'failed')
      .limit(1);

    const { data: voiceProfile, error: insertError } = await supabase
      .from('voice_profiles')
      .insert({
        business_id: businessId,
        name,
        description: description || null,
        provider: 'elevenlabs',
        provider_voice_id: voiceId,
        clone_type: 'instant',
        status: cloneData.requires_verification === true ? 'verification_required' : 'active',
        requires_verification: cloneData.requires_verification === true,
        is_default: !existingVoices?.length,
        preview_url: previewUrl,
        language,
        consent_confirmed_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id, business_id, name, description, provider, clone_type, status, requires_verification, is_default, preview_url, language, created_at')
      .single();

    if (insertError) {
      // Avoid leaving an orphaned provider voice if the database insert is rejected.
      await fetch(`${baseUrl}/v1/voices/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': providerConfig.api_key_encrypted },
      }).catch(() => {});

      const status = /limit reached/i.test(insertError.message) ? 403 : 500;
      return NextResponse.json({ error: insertError.message }, { status });
    }

    return NextResponse.json({ success: true, voice: voiceProfile }, { status: 201 });
  } catch (error) {
    console.error('[Voice Profiles] Clone failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create voice clone' },
      { status: 500 }
    );
  }
}
