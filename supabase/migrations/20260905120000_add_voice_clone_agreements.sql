-- Persist voice-cloning consent agreements for compliance and admin review.

CREATE TABLE IF NOT EXISTS public.voice_clone_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  voice_profile_id uuid REFERENCES public.voice_profiles(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_name text NOT NULL,
  voice_name text NOT NULL,
  provider text NOT NULL,
  agreement_version text NOT NULL DEFAULT 'voice-cloning-consent-v1',
  agreement_text text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_clone_agreements_business
  ON public.voice_clone_agreements(business_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_clone_agreements_voice
  ON public.voice_clone_agreements(voice_profile_id);

ALTER TABLE public.voice_clone_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_clone_agreements_select_admin" ON public.voice_clone_agreements;
CREATE POLICY "voice_clone_agreements_select_admin"
ON public.voice_clone_agreements
FOR SELECT TO authenticated
USING (is_super_admin());

REVOKE ALL ON public.voice_clone_agreements FROM anon;
GRANT SELECT ON public.voice_clone_agreements TO authenticated;
