import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VOICE_CLONING_AGREEMENT_VERSION = 'voice-cloning-consent-v1';
const VOICE_CLONING_AGREEMENT_TEXT = `VOICE CLONING CONSENT AND AUTHORIZATION

I confirm that I am either the owner of the voice being submitted or have explicit authorization from the voice owner to create and use this voice clone for the named business.

I understand that voice cloning must not be used for fraud, impersonation, scams, deception, unlawful activity, or any harmful purpose. I am responsible for ensuring that all use of the cloned voice is lawful and properly authorized.

I authorize AgentHub and the configured voice provider to process the submitted voice samples solely for creating and operating the requested business voice clone.`;

async function saveVoiceCloneAgreement(
  supabase: ReturnType<typeof createServiceClient>,
  input: { businessId: string; voiceProfileId: string; userId: string; businessName: string; voiceName: string; provider: string }
) {
  const { error } = await supabase.from('voice_clone_agreements').insert({
    business_id: input.businessId,
    voice_profile_id: input.voiceProfileId,
    accepted_by: input.userId,
    business_name: input.businessName,
    voice_name: input.voiceName,
    provider: input.provider,
    agreement_version: VOICE_CLONING_AGREEMENT_VERSION,
    agreement_text: VOICE_CLONING_AGREEMENT_TEXT,
  });
  if (error) console.error('[Voice Profiles] Failed to save cloning agreement:', error);
}

async function requireBusinessManager(req: NextRequest, businessId: string) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { error: 'Unauthorized', status: 401 as const };

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { error: 'Unauthorized', status: 401 as const };

  const userId = userData.user.id;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle(),
    supabase.from('business_members').select('role, status').eq('business_id', businessId).eq('user_id', userId).maybeSingle(),
  ]);
  const allowed = profile?.is_super_admin === true || (membership?.status === 'active' && ['owner', 'admin'].includes(membership.role));
  if (!allowed) return { error: 'You do not have permission to manage voices for this business', status: 403 as const };
  return { supabase, userId };
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('businessId')?.trim();
  if (!businessId) return NextResponse.json({ error: 'Missing businessId' }, { status: 400 });

  const auth = await requireBusinessManager(req, businessId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { supabase } = auth;

  // Voice Studio is now exclusively OmniVoice. Legacy Voicebox/ElevenLabs
  // profiles remain in the database for compatibility but are not exposed or
  // selectable here, preventing the old provider from being used accidentally.
  const [{ data: voices, error }, { data: limit }] = await Promise.all([
    supabase.from('voice_profiles')
      .select('id, business_id, name, description, provider, clone_type, status, requires_verification, is_default, preview_url, language, created_at, updated_at')
      .eq('business_id', businessId)
      .eq('provider', 'omnivoice')
      .order('created_at', { ascending: false }),
    supabase.rpc('check_plan_limit', { p_business_id: businessId, p_limit_type: 'max_voice_clones' }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ voices: voices ?? [], limit: limit ?? { allowed: false, current: 0, max: 0, limit_type: 'max_voice_clones' }, provider: 'omnivoice' });
}
