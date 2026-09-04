-- Voice cloning and cloned voice reply support

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_voice_clones integer NOT NULL DEFAULT 0;

UPDATE subscription_plans
SET max_voice_clones = CASE slug
  WHEN 'starter' THEN 1
  WHEN 'professional' THEN 2
  WHEN 'enterprise' THEN 4
  ELSE max_voice_clones
END
WHERE slug IN ('starter', 'professional', 'enterprise');

CREATE TABLE IF NOT EXISTS voice_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  display_name text NOT NULL,
  api_key_encrypted text,
  base_url text NOT NULL DEFAULT 'https://api.elevenlabs.io',
  model text NOT NULL DEFAULT 'eleven_flash_v2_5',
  is_enabled boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO voice_provider_configs (provider, display_name, base_url, model, is_enabled)
VALUES ('elevenlabs', 'ElevenLabs', 'https://api.elevenlabs.io', 'eleven_flash_v2_5', false)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  provider text NOT NULL DEFAULT 'elevenlabs',
  provider_voice_id text NOT NULL UNIQUE,
  clone_type text NOT NULL DEFAULT 'instant',
  status text NOT NULL DEFAULT 'active',
  requires_verification boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  preview_url text,
  language text,
  consent_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_profiles_clone_type_check CHECK (clone_type IN ('instant', 'professional')),
  CONSTRAINT voice_profiles_status_check CHECK (status IN ('pending', 'active', 'verification_required', 'failed', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_business_id ON voice_profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_business_status ON voice_profiles(business_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_one_default_per_business
  ON voice_profiles(business_id)
  WHERE is_default = true AND status = 'active';

ALTER TABLE voice_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_profiles_select_member" ON voice_profiles;
CREATE POLICY "voice_profiles_select_member"
ON voice_profiles FOR SELECT TO authenticated
USING (is_business_member(business_id) OR is_super_admin());

DROP POLICY IF EXISTS "voice_profiles_insert_manager" ON voice_profiles;
CREATE POLICY "voice_profiles_insert_manager"
ON voice_profiles FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = voice_profiles.business_id
      AND bm.user_id = (select auth.uid())
      AND bm.status = 'active'
      AND bm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "voice_profiles_update_manager" ON voice_profiles;
CREATE POLICY "voice_profiles_update_manager"
ON voice_profiles FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = voice_profiles.business_id
      AND bm.user_id = (select auth.uid())
      AND bm.status = 'active'
      AND bm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = voice_profiles.business_id
      AND bm.user_id = (select auth.uid())
      AND bm.status = 'active'
      AND bm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "voice_profiles_delete_manager" ON voice_profiles;
CREATE POLICY "voice_profiles_delete_manager"
ON voice_profiles FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM business_members bm
    WHERE bm.business_id = voice_profiles.business_id
      AND bm.user_id = (select auth.uid())
      AND bm.status = 'active'
      AND bm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "voice_provider_configs_select_admin" ON voice_provider_configs;
CREATE POLICY "voice_provider_configs_select_admin"
ON voice_provider_configs FOR SELECT TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS "voice_provider_configs_update_admin" ON voice_provider_configs;
CREATE POLICY "voice_provider_configs_update_admin"
ON voice_provider_configs FOR UPDATE TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON voice_profiles TO authenticated;
GRANT SELECT ON voice_provider_configs TO authenticated;

CREATE OR REPLACE FUNCTION enforce_voice_clone_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_current integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text));

  SELECT sp.max_voice_clones
  INTO v_max
  FROM business_subscriptions bs
  JOIN subscription_plans sp ON sp.id = bs.plan_id
  WHERE bs.business_id = NEW.business_id
    AND bs.status IN ('active', 'trial')
  LIMIT 1;

  IF v_max IS NULL THEN
    SELECT sp.max_voice_clones
    INTO v_max
    FROM businesses b
    JOIN subscription_plans sp ON sp.id = b.subscription_plan_id
    WHERE b.id = NEW.business_id
    LIMIT 1;
  END IF;

  IF COALESCE(v_max, 0) <= 0 THEN
    RAISE EXCEPTION 'Voice cloning is not available for this subscription plan';
  END IF;

  SELECT count(*) INTO v_current
  FROM voice_profiles vp
  WHERE vp.business_id = NEW.business_id
    AND vp.status <> 'failed';

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Voice clone limit reached for this subscription plan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voice_profiles_enforce_plan_limit ON voice_profiles;
CREATE TRIGGER voice_profiles_enforce_plan_limit
BEFORE INSERT ON voice_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_voice_clone_limit();

CREATE OR REPLACE FUNCTION voice_profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voice_profiles_updated_at ON voice_profiles;
CREATE TRIGGER voice_profiles_updated_at
BEFORE UPDATE ON voice_profiles
FOR EACH ROW EXECUTE FUNCTION voice_profiles_set_updated_at();

CREATE OR REPLACE FUNCTION voice_provider_configs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voice_provider_configs_updated_at ON voice_provider_configs;
CREATE TRIGGER voice_provider_configs_updated_at
BEFORE UPDATE ON voice_provider_configs
FOR EACH ROW EXECUTE FUNCTION voice_provider_configs_set_updated_at();

CREATE OR REPLACE FUNCTION check_plan_limit(
  p_business_id uuid,
  p_limit_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_max integer;
  v_current integer;
BEGIN
  SELECT subscription_plan_id INTO v_plan_id FROM businesses WHERE id = p_business_id;
  IF v_plan_id IS NULL THEN
    SELECT plan_id INTO v_plan_id FROM business_subscriptions WHERE business_id = p_business_id;
  END IF;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'current', 0, 'max', 0, 'limit_type', p_limit_type, 'error', 'No plan assigned');
  END IF;

  EXECUTE format('SELECT %I FROM subscription_plans WHERE id = $1', p_limit_type)
    INTO v_max USING v_plan_id;

  CASE p_limit_type
    WHEN 'max_agents' THEN SELECT count(*) INTO v_current FROM agents WHERE business_id = p_business_id;
    WHEN 'max_team_members' THEN SELECT count(*) INTO v_current FROM business_members WHERE business_id = p_business_id AND status = 'active';
    WHEN 'max_leads' THEN SELECT count(*) INTO v_current FROM leads WHERE business_id = p_business_id;
    WHEN 'max_appointments' THEN SELECT count(*) INTO v_current FROM appointments WHERE business_id = p_business_id;
    WHEN 'max_knowledge_items' THEN SELECT count(*) INTO v_current FROM knowledge_items WHERE business_id = p_business_id;
    WHEN 'max_products' THEN SELECT count(*) INTO v_current FROM products WHERE business_id = p_business_id;
    WHEN 'max_media_documents' THEN SELECT count(*) INTO v_current FROM media_documents WHERE business_id = p_business_id;
    WHEN 'max_integrations' THEN SELECT count(*) INTO v_current FROM integrations WHERE business_id = p_business_id;
    WHEN 'max_voice_clones' THEN SELECT count(*) INTO v_current FROM voice_profiles WHERE business_id = p_business_id AND status <> 'failed';
    ELSE RETURN jsonb_build_object('allowed', false, 'current', 0, 'max', 0, 'limit_type', p_limit_type, 'error', 'Unknown limit type');
  END CASE;

  RETURN jsonb_build_object(
    'allowed', v_current < COALESCE(v_max, 0),
    'current', v_current,
    'max', COALESCE(v_max, 0),
    'limit_type', p_limit_type
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION check_plan_limit(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION check_plan_limit(uuid, text) TO authenticated;
