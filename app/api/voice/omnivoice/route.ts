import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/m4a']);
const OMNIVOICE_DEFAULT_URL = 'https://agenthub-omnivoice-production.up.railway.app';
const LANGUAGE_ALIASES: Record<string, string> = { english:'en', en:'en', 'english (us)':'en', 'english (uk)':'en', urdu:'ur', 'roman urdu':'ur', romanurdu:'ur', ur:'ur', hindi:'hi', hi:'hi', arabic:'ar', ar:'ar', punjabi:'pa', pa:'pa', spanish:'es', es:'es', french:'fr', fr:'fr', german:'de', de:'de', italian:'it', it:'it', portuguese:'pt', pt:'pt', chinese:'zh', zh:'zh', japanese:'ja', ja:'ja', korean:'ko', ko:'ko' };
function normalizeLanguage(value: string | null) { const raw = (value || '').trim().toLowerCase(); return LANGUAGE_ALIASES[raw] || raw || 'en'; }

async function requireBusinessManager(req: NextRequest, businessId: string) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Unauthorized', status: 401 as const };
  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { error: 'Unauthorized', status: 401 as const };
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', userData.user.id).maybeSingle(),
    supabase.from('business_members').select('role, status').eq('business_id', businessId).eq('user_id', userData.user.id).maybeSingle(),
  ]);
  const allowed = profile?.is_super_admin === true || (membership?.status === 'active' && ['owner','admin'].includes(membership.role));
  if (!allowed) return { error: 'You do not have permission to manage voices for this business', status: 403 as const };
  return { supabase, userId: userData.user.id };
}

async function serviceRequest(baseUrl: string, path: string, init?: RequestInit) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120_000);
  try { return await fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init?.headers || {}), 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const businessId = String(form.get('businessId') || '').trim();
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    const language = normalizeLanguage(String(form.get('language') || '').trim() || null);
    const referenceText = String(form.get('referenceText') || '').trim();
    const consent = String(form.get('consent') || 'false') === 'true';
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (!businessId || !name) return NextResponse.json({ error: 'Business and voice name are required' }, { status: 400 });
    if (!consent) return NextResponse.json({ error: 'You must confirm that you own the voice or have explicit permission to clone it' }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: 'Upload at least one audio sample' }, { status: 400 });
    if (files.some((file) => file.size <= 0 || file.size > MAX_AUDIO_BYTES)) return NextResponse.json({ error: 'Each audio file must be between 1 byte and 25 MB' }, { status: 400 });
    if (files.some((file) => file.type && !ALLOWED_AUDIO_TYPES.has(file.type))) return NextResponse.json({ error: 'Unsupported audio format. Use MP3, WAV, OGG, WebM, M4A, or MP4 audio.' }, { status: 400 });

    const auth = await requireBusinessManager(req, businessId);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, userId } = auth;
    const [{ data: business }, { data: limit, error: limitError }] = await Promise.all([
      supabase.from('businesses').select('name').eq('id', businessId).maybeSingle(),
      supabase.rpc('check_plan_limit', { p_business_id: businessId, p_limit_type: 'max_voice_clones' }),
    ]);
    if (!business?.name) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    if (limitError) return NextResponse.json({ error: limitError.message }, { status: 500 });
    if (!limit?.allowed) return NextResponse.json({ error: 'Voice clone limit reached for your subscription plan', limit }, { status: 403 });

    const baseUrl = (process.env.OMNIVOICE_SERVICE_URL || OMNIVOICE_DEFAULT_URL).replace(/\/$/, '');
    const profileResponse = await serviceRequest(baseUrl, '/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: description || null, language }) }).catch(() => null);
    if (!profileResponse) return NextResponse.json({ error: 'OmniVoice service is unreachable' }, { status: 503 });
    const profileRaw = await profileResponse.text(); let profileData: Record<string, unknown> = {};
    try { profileData = profileRaw ? JSON.parse(profileRaw) : {}; } catch { profileData = { raw: profileRaw }; }
    if (!profileResponse.ok || typeof profileData.id !== 'string') return NextResponse.json({ error: typeof profileData.error === 'string' ? profileData.error : 'OmniVoice rejected profile creation' }, { status: 502 });

    const providerVoiceId = profileData.id; const sample = files[0];
    try {
      const sampleForm = new FormData(); sampleForm.append('file', sample, sample.name || 'voice-sample'); if (referenceText) sampleForm.append('reference_text', referenceText);
      const sampleResponse = await serviceRequest(baseUrl, `/profiles/${encodeURIComponent(providerVoiceId)}/samples`, { method: 'POST', body: sampleForm });
      if (!sampleResponse.ok) throw new Error((await sampleResponse.text()).slice(0, 1000) || 'OmniVoice rejected the reference audio');
    } catch (error) {
      await serviceRequest(baseUrl, `/profiles/${encodeURIComponent(providerVoiceId)}`, { method: 'DELETE' }).catch(() => null);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'OmniVoice rejected the reference audio' }, { status: 502 });
    }

    // OmniVoice is the only provider represented in Voice Studio. Make the new
    // clone the default among OmniVoice profiles so an older Voicebox default
    // can never hijack WhatsApp voice synthesis.
    await supabase.from('voice_profiles').update({ is_default: false }).eq('business_id', businessId).eq('provider', 'omnivoice').eq('is_default', true);
    const { data: voiceProfile, error: insertError } = await supabase.from('voice_profiles').insert({
      business_id: businessId, name, description: description || null, provider: 'omnivoice', provider_voice_id: providerVoiceId,
      clone_type: 'zero-shot', status: 'active', requires_verification: false, is_default: true, preview_url: null,
      language, consent_confirmed_at: new Date().toISOString(), created_by: userId
    }).select('id, business_id, name, description, provider, clone_type, status, requires_verification, is_default, preview_url, language, created_at').single();
    if (insertError) {
      await serviceRequest(baseUrl, `/profiles/${encodeURIComponent(providerVoiceId)}`, { method: 'DELETE' }).catch(() => null);
      return NextResponse.json({ error: insertError.message }, { status: /limit reached/i.test(insertError.message) ? 403 : 500 });
    }

    const agreement = await supabase.from('voice_clone_agreements').insert({ business_id: businessId, voice_profile_id: voiceProfile.id, accepted_by: userId, business_name: business.name, voice_name: name, provider: 'omnivoice', agreement_version: 'voice-cloning-consent-v1', agreement_text: 'VOICE CLONING CONSENT AND AUTHORIZATION\n\nI confirm that I am either the owner of the voice being submitted or have explicit authorization from the voice owner to create and use this voice clone for the named business.\n\nI understand that voice cloning must not be used for fraud, impersonation, scams, deception, unlawful activity, or any harmful purpose.' });
    if (agreement.error) console.error('[OmniVoice] Failed to save cloning agreement:', agreement.error);
    return NextResponse.json({ success: true, voice: voiceProfile }, { status: 201 });
  } catch (error) { console.error('[OmniVoice] Clone failed:', error); return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create OmniVoice clone' }, { status: 500 }); }
}
