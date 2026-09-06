import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ProviderRow = {
  provider: string;
  api_key_encrypted: string | null;
  base_url: string | null;
  model: string | null;
  priority: number | null;
};

function normalizeBase64(value: string) {
  return value.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
}

function cleanTranscript(value: string) {
  return value
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpeechLanguage(value: unknown, transcript: string) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'ur' || raw === 'urd' || raw.startsWith('urdu')) return 'ur';
  if (raw === 'en' || raw === 'eng' || raw.startsWith('english')) return 'en';
  if (raw === 'pa' || raw === 'pan' || raw.startsWith('punjabi')) return 'pa';
  if (/[\u0600-\u06ff]/.test(transcript)) return 'ur';
  return 'unknown';
}

async function transcribeWithGemini(
  audioBase64: string,
  mimeType: string,
  provider: ProviderRow
) {
  const apiKey = provider.api_key_encrypted?.trim();
  if (!apiKey) throw new Error('Gemini API key is unavailable');

  const model = (provider.model || 'gemini-2.5-flash').replace(/^models\//, '');
  const baseUrl = (provider.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

  const response = await fetch(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: `Transcribe this customer voice message exactly. The speaker may use Urdu, Roman Urdu, Punjabi, Roman Punjabi, English, or a mixture. Preserve the words as spoken and preserve Roman script when the speaker is using Roman Urdu/Punjabi. Do not translate, summarize, answer the customer, or invent missing words. Also identify the primary spoken language from the audio itself, not from the script used by the transcript. Return ONLY valid JSON in this exact shape: {"transcript":"...","language":"ur|en|pa|unknown"}.`,
            },
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini transcription failed: ${response.status} ${raw.slice(0, 500)}`);

  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const modelOutput = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';

  let parsed: { transcript?: string; language?: string } = {};
  try {
    parsed = JSON.parse(modelOutput);
  } catch {
    parsed = { transcript: modelOutput };
  }

  const transcript = cleanTranscript(parsed.transcript || '');
  if (!transcript) throw new Error('Gemini returned an empty transcript');

  return {
    transcript,
    language: normalizeSpeechLanguage(parsed.language, transcript),
  };
}

async function transcribeWithGroq(
  audioBase64: string,
  mimeType: string,
  provider: ProviderRow
) {
  const apiKey = provider.api_key_encrypted?.trim();
  if (!apiKey) throw new Error('Groq API key is unavailable');

  const baseUrl = (provider.base_url || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const buffer = Buffer.from(audioBase64, 'base64');
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : 'webm';
  const blob = new Blob([buffer], { type: mimeType });

  const form = new FormData();
  form.append('file', blob, `whatsapp-voice.${extension}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append(
    'prompt',
    'This is a customer voice message. Transcribe exactly as spoken. It may contain Urdu, Roman Urdu, Punjabi, Roman Punjabi, English, and mixed-language phrases. Do not translate or normalize into another language.'
  );

  const response = await fetch(
    `${baseUrl}/audio/transcriptions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    }
  );

  const raw = await response.text();
  if (!response.ok) throw new Error(`Groq transcription failed: ${response.status} ${raw.slice(0, 500)}`);

  const data = JSON.parse(raw) as { text?: string; language?: string };
  const transcript = cleanTranscript(data.text || '');
  if (!transcript) throw new Error('Groq returned an empty transcript');

  return {
    transcript,
    language: normalizeSpeechLanguage(data.language, transcript),
  };
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.AGENTHUB_WEBHOOK_SECRET || '';
    if (expectedSecret) {
      const auth = req.headers.get('authorization') || '';
      if (auth !== `Bearer ${expectedSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const audioBase64 = typeof body.audio_base64 === 'string' ? normalizeBase64(body.audio_base64) : '';
    const mimeType = typeof body.mime_type === 'string' && body.mime_type.trim()
      ? body.mime_type.trim()
      : 'audio/ogg; codecs=opus';

    if (!sessionId || !audioBase64) {
      return NextResponse.json({ error: 'session_id and audio_base64 are required' }, { status: 400 });
    }

    if (audioBase64.length > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Voice message is too large to transcribe' }, { status: 413 });
    }

    const supabase = createServiceClient();
    const { data: session, error: sessionError } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'WhatsApp session not found' }, { status: 404 });
    }

    const { data: providers, error: providerError } = await supabase
      .from('ai_provider_configs')
      .select('provider, api_key_encrypted, base_url, model, priority')
      .eq('is_enabled', true)
      .order('priority', { ascending: true });

    if (providerError || !providers?.length) {
      return NextResponse.json({ error: 'No AI provider is configured for transcription' }, { status: 503 });
    }

    const errors: string[] = [];

    const ordered = [
      ...providers.filter((p) => p.provider === 'gemini'),
      ...providers.filter((p) => p.provider === 'groq'),
    ] as ProviderRow[];

    for (const provider of ordered) {
      try {
        const result = provider.provider === 'gemini'
          ? await transcribeWithGemini(audioBase64, mimeType, provider)
          : await transcribeWithGroq(audioBase64, mimeType, provider);

        // The WhatsApp service already forwards `provider` unchanged to the
        // incoming route. Encode the detected speech language in that field so
        // we can preserve the language end-to-end without changing the public
        // WhatsApp service API shape.
        const providerWithLanguage = `${provider.provider}:${result.language}`;

        return NextResponse.json({
          success: true,
          transcript: result.transcript,
          provider: providerWithLanguage,
          speech_language: result.language,
          model: provider.provider === 'groq'
            ? 'whisper-large-v3-turbo'
            : provider.model || 'gemini-2.5-flash',
        });
      } catch (error) {
        errors.push(`${provider.provider}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return NextResponse.json(
      { error: 'All transcription providers failed', details: errors },
      { status: 502 }
    );
  } catch (error) {
    console.error('[Voice Transcription] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Voice transcription failed' },
      { status: 500 }
    );
  }
}
