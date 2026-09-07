import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '../../../../lib/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const MAX_TEXT = 1800;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_SECONDS = 10 * 60;

function wantsUrdu(language: string, text: string) {
  const value = `${language} ${text}`.toLowerCase();
  return /\burdu\b|\bpakistani\s+urdu\b|\bur\b/.test(value);
}

function alreadyUrdu(text: string) {
  return /[\u0600-\u06ff]/.test(text);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { business_id?: string; text?: string; language?: string } | null;
  const businessId = body?.business_id?.trim() || '';
  const text = String(body?.text || '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  const language = String(body?.language || 'ur').trim().toLowerCase();

  if (!businessId || !text) return NextResponse.json({ error: 'business_id and text are required' }, { status: 400, headers: CORS });

  const supabase = createServiceClient();
  const { data: integration } = await supabase
    .from('integrations')
    .select('status')
    .eq('business_id', businessId)
    .eq('type', 'website_chat')
    .maybeSingle();

  if (!integration || integration.status !== 'connected') return NextResponse.json({ error: 'Widget not active' }, { status: 404, headers: CORS });

  const { data: voice } = await supabase
    .from('voice_profiles')
    .select('id, provider, provider_voice_id, language')
    .eq('business_id', businessId)
    .eq('is_default', true)
    .eq('status', 'active')
    .maybeSingle();

  if (!voice) return NextResponse.json({ error: 'No active voice configured' }, { status: 404, headers: CORS });

  const { data: config } = await supabase
    .from('voice_provider_configs')
    .select('api_key_encrypted, base_url, model, is_enabled')
    .eq('provider', voice.provider)
    .maybeSingle();

  if (!config?.is_enabled) return NextResponse.json({ error: 'Voice provider is not configured' }, { status: 503, headers: CORS });

  let spokenText = text;
  const useUrdu = wantsUrdu(language, text);

  if (useUrdu && !alreadyUrdu(spokenText)) {
    const { data: providerRows } = await supabase
      .from('ai_provider_configs')
      .select('provider, model, base_url, api_key_encrypted, priority')
      .eq('is_enabled', true)
      .order('priority', { ascending: true });

    if (!providerRows?.length) return NextResponse.json({ error: 'No AI provider available for Urdu voice conversion' }, { status: 503, headers: CORS });

    const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({
      provider: row.provider,
      apiKey: row.api_key_encrypted || undefined,
      apiUrl: row.base_url || undefined,
      model: row.model,
      temperature: 0.2,
      maxTokens: 900,
    }));

    const converted = await generateAIResponseWithFallback({
      messages: [{ role: 'user', content: spokenText }],
      systemPrompt: 'Convert the supplied customer-facing reply into natural Pakistani Urdu written in Urdu script for spoken voice output. Preserve the exact meaning and intent. Do not translate proper product names unnecessarily. Do not add facts, greetings, sales claims, or explanations. Output ONLY the Urdu-script text that should be spoken aloud.',
      temperature: 0.2,
      maxTokens: 900,
      businessId,
    }, providerConfigs);

    if (converted.error || !converted.content?.trim()) {
      return NextResponse.json({ error: 'Urdu voice text conversion failed' }, { status: 502, headers: CORS });
    }
    spokenText = converted.content.trim().slice(0, MAX_TEXT);
  }

  let audio: ArrayBuffer;
  let contentType = 'audio/wav';

  if (voice.provider === 'voicebox') {
    const baseUrl = (config.base_url || '').replace(/\/$/, '');
    if (!baseUrl) return NextResponse.json({ error: 'Voicebox server URL is not configured' }, { status: 503, headers: CORS });

    const generationResponse = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: voice.provider_voice_id,
        text: spokenText,
        language: useUrdu ? 'ur' : (voice.language || language || 'en'),
        ...(config.model ? { engine: config.model } : {}),
      }),
    }).catch(() => null);

    if (!generationResponse) return NextResponse.json({ error: 'Voicebox server is unreachable' }, { status: 503, headers: CORS });
    const raw = await generationResponse.text();
    let generation: { id?: string; error?: string } = {};
    try { generation = raw ? JSON.parse(raw) : {}; } catch {}
    if (!generationResponse.ok || !generation.id) return NextResponse.json({ error: generation.error || 'Voice generation failed' }, { status: 502, headers: CORS });

    let audioResponse: Response | null = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = await fetch(`${baseUrl}/audio/${encodeURIComponent(generation.id)}`).catch(() => null);
      if (candidate?.ok) { audioResponse = candidate; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!audioResponse) return NextResponse.json({ error: 'Voice generation timed out' }, { status: 504, headers: CORS });
    audio = await audioResponse.arrayBuffer();
    contentType = audioResponse.headers.get('content-type') || 'audio/wav';
  } else if (voice.provider === 'elevenlabs') {
    if (!config.api_key_encrypted) return NextResponse.json({ error: 'ElevenLabs API key is not configured' }, { status: 503, headers: CORS });
    const baseUrl = (config.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voice.provider_voice_id)}?output_format=mp3_22050_32`, {
      method: 'POST',
      headers: { 'xi-api-key': config.api_key_encrypted, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spokenText, model_id: config.model || 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 } }),
    });
    if (!response.ok) return NextResponse.json({ error: 'Voice provider synthesis failed' }, { status: 502, headers: CORS });
    audio = await response.arrayBuffer();
    contentType = response.headers.get('content-type') || 'audio/mpeg';
  } else {
    return NextResponse.json({ error: 'Unsupported voice provider' }, { status: 503, headers: CORS });
  }

  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Voice provider returned invalid audio' }, { status: 502, headers: CORS });

  const extension = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
  const path = `widget-voice/${businessId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('media').upload(path, new Uint8Array(audio), { contentType, upsert: false });
  if (uploadError) return NextResponse.json({ error: `Voice storage failed: ${uploadError.message}` }, { status: 502, headers: CORS });

  const { data: signed, error: signedError } = await supabase.storage.from('media').createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'Voice URL creation failed' }, { status: 502, headers: CORS });

  return NextResponse.json({ audio_url: signed.signedUrl, content_type: contentType, spoken_text: spokenText }, { headers: CORS });
}
