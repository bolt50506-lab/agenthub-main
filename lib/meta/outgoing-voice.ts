import { createServiceClient } from '@/lib/supabase/server';

const MAX_TTS_CHARS = 1800;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_SECONDS = 10 * 60;

type VoiceResult = { audio: ArrayBuffer; contentType: string; profileId: string };

async function synthesizeWithVoicebox(baseUrl: string, profileId: string, language: string, model: string | null, text: string): Promise<VoiceResult> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId, text, language: language || 'en', ...(model ? { engine: model } : {}) }),
  });
  const raw = await response.text();
  let generation: { id?: string; error?: string } = {};
  try { generation = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok || !generation.id) throw new Error(generation.error || `Voicebox generation failed (${response.status})`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const audioResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/audio/${encodeURIComponent(generation.id)}`).catch(() => null);
    if (audioResponse?.ok) {
      const audio = await audioResponse.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES) throw new Error('Voicebox returned invalid audio size');
      return { audio, contentType: audioResponse.headers.get('content-type') || 'audio/wav', profileId };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Voicebox generation timed out');
}

async function synthesizeWithElevenLabs(baseUrl: string, apiKey: string, voiceId: string, model: string | null, text: string): Promise<VoiceResult> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model || 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 } }),
  });
  if (!response.ok) throw new Error(`Voice provider returned HTTP ${response.status}`);
  const audio = await response.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES) throw new Error('Voice provider returned invalid audio size');
  return { audio, contentType: response.headers.get('content-type') || 'audio/mpeg', profileId: voiceId };
}

export async function generateMetaVoiceUrl(businessId: string, text: string, languageHint?: string | null): Promise<{ url: string; contentType: string; profileId: string } | null> {
  const safeText = String(text || '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
  if (!businessId || !safeText) return null;

  const supabase = createServiceClient();
  const { data: voice } = await supabase.from('voice_profiles').select('id, provider, provider_voice_id, language').eq('business_id', businessId).eq('is_default', true).eq('status', 'active').maybeSingle();
  if (!voice) return null;

  const { data: config } = await supabase.from('voice_provider_configs').select('api_key_encrypted, base_url, model, is_enabled').eq('provider', voice.provider).maybeSingle();
  if (!config?.is_enabled) return null;

  const language = voice.language || languageHint || 'en';
  let result: VoiceResult;
  if (voice.provider === 'voicebox') {
    if (!config.base_url) return null;
    result = await synthesizeWithVoicebox(config.base_url, voice.provider_voice_id, language, config.model, safeText);
  } else if (voice.provider === 'elevenlabs') {
    if (!config.api_key_encrypted) return null;
    result = await synthesizeWithElevenLabs(config.base_url || 'https://api.elevenlabs.io', config.api_key_encrypted, voice.provider_voice_id, config.model, safeText);
  } else {
    return null;
  }

  const extension = result.contentType.includes('wav') ? 'wav' : result.contentType.includes('ogg') ? 'ogg' : 'mp3';
  const path = `meta-voice/${businessId}/${crypto.randomUUID()}.${extension}`;
  const bytes = new Uint8Array(result.audio);
  const { error: uploadError } = await supabase.storage.from('media').upload(path, bytes, { contentType: result.contentType, upsert: false });
  if (uploadError) throw new Error(`Meta voice upload failed: ${uploadError.message}`);

  const { data: signed, error: signedError } = await supabase.storage.from('media').createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signedError || !signed?.signedUrl) throw new Error(`Meta voice URL creation failed: ${signedError?.message || 'unknown error'}`);

  return { url: signed.signedUrl, contentType: result.contentType, profileId: result.profileId };
}
