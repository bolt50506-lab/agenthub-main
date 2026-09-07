import { createServiceClient } from '@/lib/supabase/server';

const MAX_BYTES = 12 * 1024 * 1024;

export type MetaAttachment = {
  type?: string;
  payload?: { url?: string };
};

export async function extractMetaAttachmentText(
  attachment: MetaAttachment,
  accessToken: string,
  businessId: string,
): Promise<{ text: string; kind: 'image' | 'audio' } | null> {
  const url = attachment.payload?.url;
  if (!url) return null;

  const rawType = (attachment.type || '').toLowerCase();
  const kind = rawType === 'audio' || rawType === 'voice' ? 'audio' : rawType === 'image' ? 'image' : null;
  if (!kind) return null;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Meta attachment download failed: ${response.status}`);

  const contentType = response.headers.get('content-type') || (kind === 'image' ? 'image/jpeg' : 'audio/mpeg');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_BYTES) throw new Error('Meta attachment is larger than 12 MB');

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error('Meta attachment is larger than 12 MB');

  const supabase = createServiceClient();
  const { data: providers } = await supabase
    .from('ai_provider_configs')
    .select('model, base_url, api_key_encrypted, priority')
    .eq('provider', 'gemini')
    .eq('is_enabled', true)
    .order('priority', { ascending: true })
    .limit(1);

  const provider = providers?.[0];
  if (!provider?.api_key_encrypted) {
    throw new Error('Gemini vision/audio provider is not configured');
  }

  const prompt = kind === 'image'
    ? `Read this customer image accurately. Extract all visible text, including Urdu, Roman Urdu, English, numbers, prices, product names, dates, and prescription text. Preserve the original script where possible. Do not guess unreadable text. If a section is unclear, mark it [unclear]. Return only the transcription.`
    : `Transcribe this customer voice message accurately. Support Urdu, Roman Urdu, and English. Preserve the language and wording spoken by the customer. Do not translate unless necessary for clarity. Return only the transcription.`;

  const endpoint = `${(provider.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${encodeURIComponent(provider.model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(provider.api_key_encrypted)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: contentType.split(';')[0], data: Buffer.from(bytes).toString('base64') } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Gemini media analysis failed: ${aiResponse.status} ${errorText.slice(0, 300)}`);
    }

    const json = await aiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty media transcription');

    return { text, kind };
  } finally {
    clearTimeout(timeout);
  }
}
