-- Add the self-hosted Voicebox provider.
-- Voicebox stores cloned profiles and performs synthesis on the configured server.

INSERT INTO public.voice_provider_configs (
  provider,
  display_name,
  api_key_encrypted,
  base_url,
  model,
  is_enabled
)
VALUES (
  'voicebox',
  'Voicebox',
  NULL,
  '',
  'chatterbox',
  false
)
ON CONFLICT (provider) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  model = CASE
    WHEN public.voice_provider_configs.model IS NULL
      OR public.voice_provider_configs.model = ''
      OR public.voice_provider_configs.model = 'eleven_flash_v2_5'
    THEN EXCLUDED.model
    ELSE public.voice_provider_configs.model
  END;

-- Existing rows were created before Voicebox support. Allow Voicebox as a
-- first-class provider without changing existing ElevenLabs voice records.
ALTER TABLE public.voice_profiles
  DROP CONSTRAINT IF EXISTS voice_profiles_provider_check;

