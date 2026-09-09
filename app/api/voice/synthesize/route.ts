import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
const OMNIVOICE_DEFAULT_URL = 'https://agenthub-omnivoice-production.up.railway.app';
const OMNIVOICE_POLL_TIMEOUT_MS = 285_000;
const OMNIVOICE_POLL_INTERVAL_MS = 2_000;
const MAX_SPEECH_CHARS = 1600;

function isAuthorized(req: NextRequest) {
  const expected = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  if (!expected) return true;
  const value = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return !value || value === expected;
}

function looksLikeUrdu(text: string) {
  return /[\u0600-\u06ff]/.test(text) || /\b(urdu|roman urdu|pakistani urdu|mujhe|mujhy|aap|apko|mein|main|hai|hain|karna|karen|bata|bataye|samjha|samjhaein|chahiye|nahi|nahin|kyun|kaise|kitna|meri|mera|mere|aapka|aapki|aapke|baad|kal|abhi|theek|acha|bhai|ji)\b/i.test(text);
}

function cleanSpeechText(text: string) {
  let value = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/[*_`#>]/g, ' ')
    .replace(/[•▪◦]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length <= MAX_SPEECH_CHARS) return value;
  const cut = value.slice(0, MAX_SPEECH_CHARS);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('۔ '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentenceEnd >= Math.floor(MAX_SPEECH_CHARS * 0.65)) return cut.slice(0, sentenceEnd + 1).trim();
  return cut.replace(/[,;:\-–—\s]+[^\s]*$/, '').trim();
}

function voiceInstruction(language: string) {
  if (language === 'ur') return 'Speak natural Pakistani Urdu with clear articulation, moderate pace, short natural pauses, and a calm conversational tone. Prioritize intelligibility; do not rush or slur words.';
  return 'Speak clearly and naturally with precise articulation, a moderate conversational pace, short natural pauses, and no rushed or slurred words. Prioritize intelligibility.';
}

async function prepareRomanUrduForOmniVoice(text: string, businessId: string, customerMessage = '') {
  if (!/[a-z]/i.test(text) || /[\u0600-\u06ff]/.test(text)) return text;
  const { data: rows } = await createServiceClient().from('ai_provider_configs').select('provider, api_key_encrypted, base_url, model, priority').eq('is_enabled', true).order('priority', { ascending: true });
  if (!rows?.length) return text;
  const providers: ProviderConfig[] = rows.map((row) => ({ provider: row.provider, apiKey: row.api_key_encrypted || undefined, apiUrl: row.base_url || undefined, model: row.model, temperature: 0.05, maxTokens: 900 }));
  const result = await generateAIResponseWithFallback({ messages: [{ role: 'user', content: text }], systemPrompt: `Convert this Roman Urdu customer-facing sentence into natural Pakistani Urdu SCRIPT for speech synthesis. This is NOT a translation. Preserve the exact Pakistani Urdu vocabulary, meaning, names, numbers, prices, dates and product names. Do not add Hindi vocabulary. Do not formalize it. Output ONLY Urdu script, no explanation. Customer context: ${customerMessage.slice(0, 600)}`, temperature: 0.05, maxTokens: 900, businessId }, providers);
  return result.error || !result.content?.trim() ? text : result.content.trim().slice(0, 3000);
}

async function synthesizeOmniVoice(baseUrl: string, profileId: string, text: string, language: string, instruct?: string) {
  const secret = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  const headers = { 'Content-Type': 'application/json', 'x-agenthub-secret': secret };
  const create = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profile_id: profileId, text, language, ...(instruct ? { instruct } : {}) }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!create) return { response: null as Response | null, error: 'OmniVoice service is unreachable' };
  const raw = await create.text();
  let generation: { id?: string; error?: string } = {};
  try { generation = raw ? JSON.parse(raw) : {}; } catch {}
  if (!create.ok || !generation.id) return { response: null, error: generation.error || `OmniVoice generation failed (HTTP ${create.status})` };

  const deadline = Date.now() + OMNIVOICE_POLL_TIMEOUT_MS;
  let attempt = 0;
  console.log(`[OmniVoice] Job ${generation.id} accepted; waiting asynchronously for completion`);
  while (Date.now() < deadline) {
    attempt += 1;
    const audio = await fetch(`${baseUrl}/audio/${encodeURIComponent(generation.id)}`, {
      headers: { 'x-agenthub-secret': secret }, signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (audio?.ok) {
      console.log(`[OmniVoice] Job ${generation.id} completed after ${attempt} polls`);
      return { response: audio, error: null };
    }
    const history = await fetch(`${baseUrl}/history/${encodeURIComponent(generation.id)}`, {
      headers: { 'x-agenthub-secret': secret }, signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (history?.ok) {
      const status = await history.json().catch(() => null) as { status?: string; error?: string } | null;
      if (status?.status === 'completed') { await new Promise((resolve) => setTimeout(resolve, 500)); continue; }
      if (status?.status === 'failed') return { response: null, error: status.error || 'OmniVoice generation failed' };
    }
    await new Promise((resolve) => setTimeout(resolve, audio?.status === 409 ? OMNIVOICE_POLL_INTERVAL_MS : 3_000));
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

  const { data: voice } = await supabase.from('voice_profiles').select('id, provider, provider_voice_id, language').eq('business_id', session.business_id).eq('provider', 'omnivoice').eq('is_default', true).eq('status', 'active').maybeSingle();
  if (!voice) return NextResponse.json({ error: 'No active OmniVoice clone configured' }, { status: 404 });

  const baseUrl = (process.env.OMNIVOICE_SERVICE_URL || OMNIVOICE_DEFAULT_URL).replace(/\/$/, '');
  const wantsUrdu = looksLikeUrdu(text) || looksLikeUrdu(customerMessage);
  const preparedText = wantsUrdu ? await prepareRomanUrduForOmniVoice(text, session.business_id, customerMessage) : text;
  const ttsText = cleanSpeechText(preparedText);
  if (!ttsText) return NextResponse.json({ error: 'Voice text became empty after speech cleanup' }, { status: 400 });
  const ttsLanguage = wantsUrdu ? 'ur' : (voice.language || body?.language || 'en').toLowerCase();
  const generated = await synthesizeOmniVoice(baseUrl, voice.provider_voice_id, ttsText, ttsLanguage, voiceInstruction(ttsLanguage));
  if (!generated.response) return NextResponse.json({ error: generated.error || 'OmniVoice synthesis failed' }, { status: 502 });
  const audio = await generated.response.arrayBuffer();
  if (!audio.byteLength) return NextResponse.json({ error: 'OmniVoice returned empty audio' }, { status: 502 });
  return new Response(audio, { status: 200, headers: { 'Content-Type': generated.response.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store', 'X-AgentHub-Voice-Profile': voice.id, 'X-AgentHub-Voice-Provider': 'omnivoice', 'X-AgentHub-Voice-Language': ttsLanguage } });
}
