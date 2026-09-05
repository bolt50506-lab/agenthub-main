import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const VOICE_CLONING_AGREEMENT_VERSION = 'voice-cloning-consent-v1';
const VOICE_CLONING_AGREEMENT_TEXT = `VOICE CLONING CONSENT AND AUTHORIZATION

I confirm that I am either the owner of the voice being submitted or have explicit authorization from the voice owner to create and use this voice clone for the named business.

I understand that voice cloning must not be used for fraud, impersonation, scams, deception, unlawful activity, or any harmful purpose. I am responsible for ensuring that all use of the cloned voice is lawful and properly authorized.

I authorize AgentHub and the configured voice provider to process the submitted voice samples solely for creating and operating the requested business voice clone.`;

async function saveVoiceCloneAgreement(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    businessId: string;
    voiceProfileId: string;
    userId: string;
    businessName: string;
    voiceName: string;
    provider: string;
  }
) {
  const { error } = await supabase.from('voice_clone_agreements').insert({
    business_id: input.businessId,
    voice_profile_id: input.voiceProfileId,
    accepted_by: input.userId,
    business_name: input.businessName,
    voice_name: input.voiceName,
    provider: input.provider,
    agreement_version: VOICE_CLONING_AGREEMENT_VERSION,
    agreement_text: VOICE_CLONING_AGREEMENT_TEXT,
  });

  if (error) {
    // The clone itself is valid even if the audit write fails, but log loudly
    // so an administrator can investigate rather than silently losing evidence.
    console.error('[Voice Profiles] Failed to save cloning agreement:', error);
  }
}

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


function normalizeVoiceboxLanguage(value: string | null): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return 'en';

  const aliases: Record<string, string> = {
    english: 'en',
    'english (us)': 'en',
    'english (uk)': 'en',
    en: 'en',
    chinese: 'zh',
    mandarin: 'zh',
    'chinese (mandarin)': 'zh',
    zh: 'zh',
    japanese: 'ja',
    ja: 'ja',
    korean: 'ko',
    ko: 'ko',
    german: 'de',
    de: 'de',
    french: 'fr',
    fr: 'fr',
    russian: 'ru',
    ru: 'ru',
    portuguese: 'pt',
    pt: 'pt',
    spanish: 'es',
    es: 'es',
    italian: 'it',
    it: 'it',
    hebrew: 'he',
    he: 'he',
    arabic: 'ar',
    ar: 'ar',
    danish: 'da',
    da: 'da',
    greek: 'el',
    el: 'el',
    finnish: 'fi',
    fi: 'fi',
    hindi: 'hi',
    hi: 'hi',
    urdu: 'hi',
    'roman urdu': 'hi',
    romanurdu: 'hi',
    malay: 'ms',
    ms: 'ms',
  };

  const supported = new Set(['zh', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'pt', 'es', 'it', 'he', 'ar', 'da', 'el', 'fi', 'hi', 'ms']);
  const normalized = aliases[raw] || raw;
  return supported.has(normalized) ? normalized : 'en';
}

function providerErrorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;

  if (Array.isArray(data.detail)) {
    const messages = data.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') return item.msg;
        return '';
      })
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
  }

  if (typeof data.raw === 'string' && data.raw.trim()) return data.raw.slice(0, 1000);
  return fallback;
}

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
    const voiceboxLanguage = normalizeVoiceboxLanguage(language);
    const consent = String(form.get('consent') || 'false') === 'true';
    const referenceText = String(form.get('referenceText') || '').trim();
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

    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .maybeSingle();

    if (!business?.name) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

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

    const { data: providerConfigs, error: providerError } = await supabase
      .from('voice_provider_configs')
      .select('provider, api_key_encrypted, base_url, model, is_enabled')
      .eq('is_enabled', true)
      .in('provider', ['voicebox', 'elevenlabs']);

    if (providerError) {
      return NextResponse.json({ error: providerError.message }, { status: 500 });
    }

    // Prefer the self-hosted Voicebox provider when the platform admin enables it.
    const providerConfig = (providerConfigs || []).find((item) => item.provider === 'voicebox')
      || (providerConfigs || []).find((item) => item.provider === 'elevenlabs');

    if (!providerConfig) {
      return NextResponse.json(
        { error: 'Voice cloning is not configured by the platform administrator' },
        { status: 503 }
      );
    }

    if (providerConfig.provider === 'voicebox') {
      const baseUrl = (providerConfig.base_url || '').replace(/\/$/, '');
      if (!baseUrl) {
        return NextResponse.json({ error: 'Voicebox server URL is not configured by the platform administrator' }, { status: 503 });
      }

      // Voicebox requires a profile first, then one or more reference audio samples.
      let profileResponse: Response;
      try {
        profileResponse = await fetch(
          `${baseUrl}/profiles`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description: description || null,
              language: voiceboxLanguage,
            }),
          }
        );
      } catch (error) {
        console.error('[Voice Profiles] Voicebox is unreachable:', baseUrl, error);
        return NextResponse.json(
          {
            error: 'Voicebox server is unreachable. Start or repair the Voicebox remote server, then verify the configured Voicebox Server URL.',
            provider: 'voicebox',
          },
          { status: 503 }
        );
      }

      const profileRaw = await profileResponse.text();
      let profileData: Record<string, unknown> = {};
      try { profileData = profileRaw ? JSON.parse(profileRaw) as Record<string, unknown> : {}; } catch { profileData = { raw: profileRaw }; }

      if (!profileResponse.ok || typeof profileData.id !== 'string') {
        return NextResponse.json({
          error: providerErrorMessage(profileData, 'Voicebox rejected profile creation'),
          providerStatus: profileResponse.status,
        }, { status: 502 });
      }

      const providerVoiceId = profileData.id;
      try {
        for (const file of files) {
          const sampleForm = new FormData();
          sampleForm.append('file', file, file.name || 'voice-sample');
          // Exact reference text gives Voicebox the best cloning result. If omitted,
          // fall back to the voice description/name instead of blocking legacy clients.
          sampleForm.append('reference_text', referenceText || description || name);

          const sampleResponse = await fetch(
            `${baseUrl}/profiles/${encodeURIComponent(providerVoiceId)}/samples`,
            { method: 'POST', body: sampleForm }
          );

          if (!sampleResponse.ok) {
            const details = (await sampleResponse.text()).slice(0, 1000);
            throw new Error(details || 'Voicebox rejected the reference audio sample');
          }
        }
      } catch (sampleError) {
        await fetch(`${baseUrl}/profiles/${encodeURIComponent(providerVoiceId)}`, { method: 'DELETE' }).catch(() => {});
        return NextResponse.json({ error: sampleError instanceof Error ? sampleError.message : 'Voicebox rejected the reference audio sample' }, { status: 502 });
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
          provider: 'voicebox',
          provider_voice_id: providerVoiceId,
          clone_type: 'instant',
          status: 'active',
          requires_verification: false,
          is_default: !existingVoices?.length,
          preview_url: null,
          language: voiceboxLanguage,
          consent_confirmed_at: new Date().toISOString(),
          created_by: userId,
        })
        .select('id, business_id, name, description, provider, clone_type, status, requires_verification, is_default, preview_url, language, created_at')
        .single();

      if (insertError) {
        await fetch(`${baseUrl}/profiles/${encodeURIComponent(providerVoiceId)}`, { method: 'DELETE' }).catch(() => {});
        const status = /limit reached/i.test(insertError.message) ? 403 : 500;
        return NextResponse.json({ error: insertError.message }, { status });
      }

      await saveVoiceCloneAgreement(supabase, {
        businessId,
        voiceProfileId: voiceProfile.id,
        userId,
        businessName: business.name,
        voiceName: name,
        provider: 'voicebox',
      });

      return NextResponse.json({ success: true, voice: voiceProfile }, { status: 201 });
    }

    if (!providerConfig.api_key_encrypted) {
      return NextResponse.json({ error: 'ElevenLabs API key is not configured by the platform administrator' }, { status: 503 });
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
        provider: providerConfig.provider,
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

    await saveVoiceCloneAgreement(supabase, {
      businessId,
      voiceProfileId: voiceProfile.id,
      userId,
      businessName: business.name,
      voiceName: name,
      provider: providerConfig.provider,
    });

    return NextResponse.json({ success: true, voice: voiceProfile }, { status: 201 });
  } catch (error) {
    console.error('[Voice Profiles] Clone failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create voice clone' },
      { status: 500 }
    );
  }
}
