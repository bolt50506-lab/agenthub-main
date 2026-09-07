import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const OMNIVOICE_DEFAULT_URL = 'https://agenthub-omnivoice-production.up.railway.app';

function isAuthorized(req: NextRequest) {
  const expected = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  if (!expected) return true;
  const value = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return !value || value === expected;
}

function looksLikeUrdu(text: string) {
  return /[\u0600-\u06ff]/.test(text) || /\b(urdu|roman urdu|pakistani urdu|mujhe|mujhy|aap|apko|mein|main|hai|hain|karna|karen|bata|bataye|samjha|samjhaein|chahiye|nahi|nahin|kyun|kaise|kitna|meri|mera|mere|aapka|aapki|aapke|baad|kal|abhi|theek|acha|bhai|ji)\b/i.test(text);
}

async function prepareRomanUrduForOmniVoice(text: string, businessId: string, customerMessage = '') {
  if (!/[a-z]/i.test(text) || /[\u0600-\u06ff]/.test(text)) return text;
  const { data: rows } = await createServiceClient().from('ai_provider_configs').select('provider, api_key_encrypted, base_url, model, priority').eq('is_enabled', true).order('priority', { ascending: true });
  if (!rows?.length) return text;
  const providers: ProviderConfig[] = rows.map((row) => ({ provider: row.provider, apiKey: row.api_key_encrypted || undefined, apiUrl: row.base_url || undefined, model: row.model, temperature: 0.05, maxTokens: 900 }));
  const result = await generateAIResponseWithFallback({
    messages: [{ role: 'user', content: text }],
    systemPrompt: `Convert this Roman Urdu customer-facing sentence into natural Pakistani Urdu SCRIPT for speech synthesis. This is NOT a translation. Preserve the exact Pakistani Urdu vocabulary, meaning, names, numbers, prices, dates and product names. Do not add Hindi vocabulary. Do not formalize it. Output ONLY Urdu script, no explanation. Customer context: ${customerMessage.slice(0, 600)}`,
    temperature: 0.05, maxTokens: 900, businessId,
  }, providers);
  return result.error || !result.content?.trim() ? text : result.content.trim().slice(0, 3000);
}

async function synthesizeOmniVoice(baseUrl: string, profileId: string, text: string, language: string, instruct?: string) {
  const headers = { 'Content-Type': 'application/json', 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' };
  const create = await fetch(`${baseUrl}/generate`, { method: 'POST', headers, body: JSON.stringify({ profile_id: profileId, text, language, instruct }), signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!create) return { response: null as Response | null, error: 'OmniVoice service is unreachable' };
  const raw = await create.text(); let generation: { id?: string; error?: string } = {};
  try { generation = raw ? JSON.parse(raw) : {}; } catch {}
  if (!create.ok || !generation.id) return { response: null, error: generation.error || 'OmniVoice generation failed' };
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const audio = await fetch(`${baseUrl}/audio/${encodeURIComponent(generation.id)}`, { headers: { 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (audio?.ok) return { response: audio, error: null };
    const history = await fetch(`${baseUrl}/history/${encodeURIComponent(generation.id)}`, { headers: { 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (history?.ok) { const status = await history.json().catch(() => null) as { status?: string; error?: string } | null; if (status?.status === 'failed') return { response: null, error: status.error || 'OmniVoice generation failed' }; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { response: null, error: 'OmniVoice generation timed out waiting for audio' };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { session_id?: string; text?: string; customer_message?: string; language?: string } | null;
  const sessionId = body?.session_id?.trim() || '', text = body?.text?.trim() || '', customerMessage = body?.customer_message?.trim() || '';
  if (!sessionId || !text) return NextResponse.json({ error: 'session_id and text are required' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: 'Voice text is too long' }, { status: 400 });
  const supabase = createServiceClient();
  const { data: session } = await supabase.from('whatsapp_sessions').select('business_id').eq('session_id', sessionId).maybeSingle();
  if (!session?.business_id) return NextResponse.json({ error: 'WhatsApp session not found' }, { status: 404 });
  const { data: voice } = await supabase.from('voice_profiles').select('id, provider, provider_voice_id, language').eq('business_id', session.business_id).eq('is_default', true).eq('status', 'active').maybeSingle();
  if (!voice) return NextResponse.json({ error: 'No active cloned voice configured' }, { status: 404 });

  if (voice.provider === 'omnivoice') {
    const baseUrl = (process.env.OMNIVOICE_SERVICE_URL || OMNIVOICE_DEFAULT_URL).replace(/\/$/, '');
    const wantsUrdu = looksLikeUrdu(text) || looksLikeUrdu(customerMessage);
    const ttsText = wantsUrdu ? await prepareRomanUrduForOmniVoice(text, session.business_id, customerMessage) : text;
    const ttsLanguage = wantsUrdu ? 'ur' : (voice.language || body?.language || 'en').toLowerCase();
    const generated = await synthesizeOmniVoice(baseUrl, voice.provider_voice_id, ttsText, ttsLanguage, wantsUrdu ? 'natural conversational Pakistani Urdu delivery; warm human pacing; preserve the speaker identity' : undefined);
    if (!generated.response) return NextResponse.json({ error: generated.error || 'OmniVoice synthesis failed' }, { status: 502 });
    const audio = await generated.response.arrayBuffer();
    if (!audio.byteLength) return NextResponse.json({ error: 'OmniVoice returned empty audio' }, { status: 502 });
    return new Response(audio, { status: 200, headers: { 'Content-Type': generated.response.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store', 'X-AgentHub-Voice-Profile': voice.id, 'X-AgentHub-Voice-Provider': 'omnivoice', 'X-AgentHub-Voice-Language': ttsLanguage } });
  }

  const { data: config } = await supabase.from('voice_provider_configs').select('api_key_encrypted, base_url, model, is_enabled').eq('provider', voice.provider).maybeSingle();
  if (!config?.is_enabled) return NextResponse.json({ error: 'Voice provider is not configured' }, { status: 503 });

  if (voice.provider === 'voicebox') {
    const baseUrl = (config.base_url || '').replace(/\/$/, '');
    if (!baseUrl) return NextResponse.json({ error: 'Voicebox server URL is not configured' }, { status: 503 });
    const generateResponse = await fetch(`${baseUrl}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: voice.provider_voice_id, text, language: voice.language || 'en', ...(config.model ? { engine: config.model } : {}) }) }).catch(() => null);
    if (!generateResponse) return NextResponse.json({ error: 'Voicebox server is unreachable' }, { status: 503 });
    const raw = await generateResponse.text(); let generation: { id?: string; error?: string } = {};
    try { generation = raw ? JSON.parse(raw) : {}; } catch {}
    if (!generateResponse.ok || !generation.id) return NextResponse.json({ error: generation.error || 'Voicebox generation failed' }, { status: 502 });
    let audioResponse: Response | null = null;
    for (let attempt = 0; attempt < 90; attempt += 1) { const response = await fetch(`${baseUrl}/audio/${encodeURIComponent(generation.id)}`).catch(() => null); if (response?.ok) { audioResponse = response; break; } await new Promise((resolve) => setTimeout(resolve, 1000)); }
    if (!audioResponse) return NextResponse.json({ error: 'Voicebox generation timed out waiting for audio' }, { status: 504 });
    return new Response(await audioResponse.arrayBuffer(), { status: 200, headers: { 'Content-Type': audioResponse.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store' } });
  }

  if (voice.provider !== 'elevenlabs') return NextResponse.json({ error: 'Unsupported voice provider' }, { status: 503 });
  if (!config.api_key_encrypted) return NextResponse.json({ error: 'ElevenLabs API key is not configured' }, { status: 503 });
  const baseUrl = (config.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
  const providerResponse = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voice.provider_voice_id)}?output_format=mp3_22050_32`, { method: 'POST', headers: { 'xi-api-key': config.api_key_encrypted, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: config.model || 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 } }) });
  if (!providerResponse.ok) return NextResponse.json({ error: 'Voice synthesis failed', details: (await providerResponse.text()).slice(0, 1000) }, { status: 502 });
  return new Response(await providerResponse.arrayBuffer(), { status: 200, headers: { 'Content-Type': providerResponse.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-AgentHub-Voice-Profile': voice.id } });
}
