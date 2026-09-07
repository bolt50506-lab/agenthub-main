import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanJsonText(value: string) {
  return value.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: auth } = await supabase.auth.getUser(token);
    const user = auth.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const mediaId = typeof body.media_id === 'string' ? body.media_id : '';
    const businessId = typeof body.business_id === 'string' ? body.business_id : '';
    if (!mediaId || !businessId) return NextResponse.json({ error: 'media_id and business_id are required' }, { status: 400 });

    const { data: member } = await supabase.from('business_members').select('id').eq('business_id', businessId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: media } = await supabase.from('media_documents').select('id,file_path,file_type,mime_type,category').eq('id', mediaId).eq('business_id', businessId).maybeSingle();
    if (!media) return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    if (media.file_type !== 'image' || !String(media.mime_type || '').startsWith('image/')) return NextResponse.json({ error: 'Only image files can be analyzed' }, { status: 400 });

    const { data: provider } = await supabase.from('ai_provider_configs').select('api_key_encrypted,model,base_url').eq('provider', 'gemini').eq('is_enabled', true).order('priority', { ascending: true }).limit(1).maybeSingle();
    if (!provider?.api_key_encrypted) {
      await supabase.from('image_analysis_results').upsert({ business_id: businessId, media_document_id: mediaId, processing_status: 'failed', verification_status: 'unverified', uncertain_segments: [{ text: '', note: 'Gemini vision provider is not configured.' }] }, { onConflict: 'media_document_id' });
      return NextResponse.json({ error: 'Gemini vision provider is not configured' }, { status: 503 });
    }

    await supabase.from('image_analysis_results').upsert({ business_id: businessId, media_document_id: mediaId, processing_status: 'processing', verification_status: 'unverified' }, { onConflict: 'media_document_id' });

    const { data: signed } = await supabase.storage.from('media').createSignedUrl(media.file_path, 300);
    if (!signed?.signedUrl) throw new Error('Unable to create image access URL');
    const imageResponse = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(10000) });
    if (!imageResponse.ok) throw new Error(`Image download failed: ${imageResponse.status}`);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (imageBuffer.length > 12 * 1024 * 1024) throw new Error('Image is too large for AI analysis');

    const model = (provider.model || 'gemini-2.5-flash').replace(/^models\//, '');
    const baseUrl = (provider.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(provider.api_key_encrypted)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [
        { text: `Analyze this image for a business assistant. If it is a prescription, receipt, invoice, product label, document, or handwritten note, extract visible text accurately. Preserve Urdu script and Roman Urdu exactly where visible. Never invent unreadable text. Return ONLY JSON: {"extracted_text":"...","confidence":"high|medium|low","uncertain_segments":[{"text":"...","note":"..."}]}. For medical prescriptions, do not diagnose, recommend treatment, or invent dosages.` },
        { inlineData: { mimeType: media.mime_type, data: imageBuffer.toString('base64') } },
      ] }], generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' } }),
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`Gemini vision failed: ${response.status} ${raw.slice(0, 500)}`);
    const payload = JSON.parse(raw) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const parsed = JSON.parse(cleanJsonText(output)) as { extracted_text?: string; confidence?: string; uncertain_segments?: unknown[] };

    await supabase.from('image_analysis_results').upsert({
      business_id: businessId, media_document_id: mediaId, processing_status: 'completed', verification_status: 'unverified',
      extracted_text: parsed.extracted_text || '', confidence: ['high', 'medium', 'low'].includes(parsed.confidence || '') ? parsed.confidence : 'low',
      uncertain_segments: Array.isArray(parsed.uncertain_segments) ? parsed.uncertain_segments : [],
      analyzed_by: `gemini:${model}`,
    }, { onConflict: 'media_document_id' });

    return NextResponse.json({ success: true, extracted_text: parsed.extracted_text || '', confidence: parsed.confidence || 'low', uncertain_segments: parsed.uncertain_segments || [] });
  } catch (error) {
    console.error('[Media Analyze]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Image analysis failed' }, { status: 500 });
  }
}
