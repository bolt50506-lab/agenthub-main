import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  if (secret && req.headers.get('x-agenthub-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { text?: string; target_language?: string; business_id?: string; customer_message?: string } | null;
  const text = String(body?.text || '').trim().slice(0, 1800);
  const targetLanguage = String(body?.target_language || '').toLowerCase();
  const businessId = String(body?.business_id || '').trim();
  if (!text || targetLanguage !== 'ur') return NextResponse.json({ text });

  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from('ai_provider_configs')
    .select('provider, model, base_url, api_key_encrypted, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (!rows?.length) return NextResponse.json({ error: 'No AI provider available' }, { status: 503 });

  const providers: ProviderConfig[] = rows.map((row) => ({
    provider: row.provider,
    apiKey: row.api_key_encrypted || undefined,
    apiUrl: row.base_url || undefined,
    model: row.model,
    temperature: 0.15,
    maxTokens: 900,
  }));

  const result = await generateAIResponseWithFallback({
    messages: [{ role: 'user', content: text }],
    systemPrompt: `Rewrite the supplied customer-facing answer into natural Pakistani Urdu for spoken voice output. The customer specifically requested Urdu voice. Translate the meaning completely; do NOT merely transliterate English. Use Urdu script (اردو), natural Pakistani wording, and conversational sentences suitable for a female Pakistani Urdu neural voice. Preserve names, numbers, prices, dates, URLs, and product names accurately. Do not add or remove information. Do not mention translation or voice. Output ONLY the Urdu text to be spoken.\nCustomer's original request: ${String(body?.customer_message || '').slice(0, 800)}`,
    temperature: 0.15,
    maxTokens: 900,
    businessId: businessId || undefined,
  }, providers);

  if (result.error || !result.content?.trim()) return NextResponse.json({ error: 'Urdu conversion failed' }, { status: 502 });
  return NextResponse.json({ text: result.content.trim().slice(0, 1800) });
}
