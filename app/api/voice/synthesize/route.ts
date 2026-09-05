import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(req: NextRequest) {
  const expected = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  if (!expected) return true;

  const value = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // The WhatsApp worker and the dashboard can be deployed independently.
  // A stale Railway secret must not silently force a cloned-voice reply to
  // Edge TTS. Requests are still constrained below to an existing WhatsApp
  // session and that session's active business default voice.
  return !value || value === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { session_id?: string; text?: string } | null;
  const sessionId = body?.session_id?.trim() || '';
  const text = body?.text?.trim() || '';

  if (!sessionId || !text) {
    return NextResponse.json({ error: 'session_id and text are required' }, { status: 400 });
  }

  if (text.length > 5000) {
    return NextResponse.json({ error: 'Voice text is too long' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('business_id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (!session?.business_id) {
    return NextResponse.json({ error: 'WhatsApp session not found' }, { status: 404 });
  }

  const { data: voice } = await supabase
    .from('voice_profiles')
    .select('id, provider, provider_voice_id, language')
    .eq('business_id', session.business_id)
    .eq('is_default', true)
    .eq('status', 'active')
    .maybeSingle();

  if (!voice) {
    return NextResponse.json({ error: 'No active cloned voice configured' }, { status: 404 });
  }

  const { data: config } = await supabase
    .from('voice_provider_configs')
    .select('api_key_encrypted, base_url, model, is_enabled')
    .eq('provider', voice.provider)
    .maybeSingle();

  if (!config?.is_enabled) {
    return NextResponse.json({ error: 'Voice provider is not configured' }, { status: 503 });
  }

  if (voice.provider === 'voicebox') {
    const baseUrl = (config.base_url || '').replace(/\/$/, '');
    if (!baseUrl) {
      return NextResponse.json({ error: 'Voicebox server URL is not configured' }, { status: 503 });
    }

    const generateResponse = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: voice.provider_voice_id,
        text,
        language: voice.language || 'en',
        ...(config.model ? { engine: config.model } : {}),
      }),
    }).catch((error) => {
      console.error('[Voice Synthesize] Voicebox request failed:', error);
      return null;
    });

    if (!generateResponse) {
      return NextResponse.json({ error: 'Voicebox server is unreachable' }, { status: 503 });
    }

    const generateRaw = await generateResponse.text();
    let generation: { id?: string; status?: string; error?: string } = {};
    try { generation = generateRaw ? JSON.parse(generateRaw) : {}; } catch {}

    if (!generateResponse.ok || !generation.id) {
      console.error('[Voice Synthesize] Voicebox generation failed:', generateResponse.status, generateRaw.slice(0, 1000));
      return NextResponse.json(
        { error: generation.error || 'Voicebox generation failed', details: generateRaw.slice(0, 1000) },
        { status: 502 }
      );
    }

    let audioResponse: Response | null = null;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const response = await fetch(`${baseUrl}/audio/${encodeURIComponent(generation.id)}`).catch(() => null);
      if (response?.ok) {
        audioResponse = response;
        break;
      }

      const historyResponse = await fetch(`${baseUrl}/history/${encodeURIComponent(generation.id)}`).catch(() => null);
      if (historyResponse?.ok) {
        const history = await historyResponse.json().catch(() => null) as { status?: string; error?: string } | null;
        if (history?.status === 'failed') {
          return NextResponse.json({ error: history.error || 'Voicebox generation failed' }, { status: 502 });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!audioResponse) {
      return NextResponse.json({ error: 'Voicebox generation timed out waiting for audio' }, { status: 504 });
    }

    const audio = await audioResponse.arrayBuffer();
    if (!audio.byteLength) {
      return NextResponse.json({ error: 'Voicebox returned empty audio' }, { status: 502 });
    }

    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': audioResponse.headers.get('content-type') || 'audio/wav',
        'Cache-Control': 'no-store',
        'X-AgentHub-Voice-Profile': voice.id,
        'X-AgentHub-Voice-Provider': 'voicebox',
      },
    });
  }

  if (voice.provider !== 'elevenlabs') {
    return NextResponse.json({ error: 'Unsupported voice provider' }, { status: 503 });
  }

  if (!config.api_key_encrypted) {
    return NextResponse.json({ error: 'ElevenLabs API key is not configured' }, { status: 503 });
  }

  const baseUrl = (config.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
  const providerResponse = await fetch(
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voice.provider_voice_id)}?output_format=mp3_22050_32`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.api_key_encrypted,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: config.model || 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
    }
  );

  if (!providerResponse.ok) {
    const details = (await providerResponse.text()).slice(0, 1000);
    console.error('[Voice Synthesize] Provider failed:', providerResponse.status, details);
    return NextResponse.json({ error: 'Voice synthesis failed', details }, { status: 502 });
  }

  const audio = await providerResponse.arrayBuffer();

  return new Response(audio, {
    status: 200,
    headers: {
      'Content-Type': providerResponse.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-AgentHub-Voice-Profile': voice.id,
    },
  });
}
