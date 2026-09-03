-- Drop old create_business_with_plan so we can replace with new signature
DROP FUNCTION IF EXISTS create_business_with_plan(text, text, text, uuid);

-- Add feature limit columns to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_leads integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_appointments integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_knowledge_items integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_products integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_media_documents integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_integrations integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_ai_usage_per_month integer,
  ADD COLUMN IF NOT EXISTS yearly_price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS country text;

UPDATE subscription_plans SET
  max_agents = 2, max_team_members = 3, max_leads = 100, max_appointments = 200,
  max_knowledge_items = 20, max_products = 50, max_media_documents = 20,
  max_integrations = 3, max_ai_usage_per_month = 1000,
  yearly_price_cents = 34800,
  description = 'Perfect for small businesses getting started with AI automation.'
WHERE slug = 'starter';

UPDATE subscription_plans SET
  max_agents = 10, max_team_members = 10, max_leads = 1000, max_appointments = 2000,
  max_knowledge_items = 200, max_products = 500, max_media_documents = 200,
  max_integrations = 10, max_ai_usage_per_month = 10000,
  yearly_price_cents = 94800,
  description = 'For growing businesses that need more power and flexibility.'
WHERE slug = 'professional';

UPDATE subscription_plans SET
  max_agents = 50, max_team_members = 50, max_leads = 10000, max_appointments = 10000,
  max_knowledge_items = 1000, max_products = 2000, max_media_documents = 1000,
  max_integrations = 50, max_ai_usage_per_month = 100000,
  yearly_price_cents = 238800,
  description = 'Enterprise-grade solution with maximum capacity and support.'
WHERE slug = 'enterprise';

CREATE TABLE IF NOT EXISTS business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'active',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'business_subscriptions_updated_at') THEN
    CREATE TRIGGER business_subscriptions_updated_at
      BEFORE UPDATE ON business_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business_id ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_plan_id ON business_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status ON business_subscriptions(status);

ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_subscriptions_select_member" ON business_subscriptions;
CREATE POLICY "business_subscriptions_select_member" ON business_subscriptions FOR SELECT
  TO authenticated USING (is_business_member(business_id) OR is_super_admin());

DROP POLICY IF EXISTS "business_subscriptions_insert_admin" ON business_subscriptions;
CREATE POLICY "business_subscriptions_insert_admin" ON business_subscriptions FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "business_subscriptions_update_admin" ON business_subscriptions;
CREATE POLICY "business_subscriptions_update_admin" ON business_subscriptions FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscription_status' AND conrelid = 'business_subscriptions'::regclass) THEN
    ALTER TABLE business_subscriptions ADD CONSTRAINT chk_subscription_status
      CHECK (status IN ('trial', 'active', 'suspended', 'cancelled', 'expired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_cycle' AND conrelid = 'business_subscriptions'::regclass) THEN
    ALTER TABLE business_subscriptions ADD CONSTRAINT chk_billing_cycle
      CHECK (billing_cycle IN ('monthly', 'yearly'));
  END IF;
END $$;

-- New create_business_with_plan with full business info
CREATE OR REPLACE FUNCTION create_business_with_plan(
  p_name text,
  p_industry text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_owner_email text DEFAULT NULL,
  p_owner_full_name text DEFAULT NULL,
  p_owner_phone text DEFAULT NULL,
  p_plan_id uuid DEFAULT NULL,
  p_billing_cycle text DEFAULT 'monthly'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_owner_id uuid;
  v_result jsonb;
BEGIN
  IF NOT (SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)) THEN
    RAISE EXCEPTION 'Only super admins can create businesses';
  END IF;

  INSERT INTO businesses (
    name, industry, description, website, phone, address, country, timezone,
    subscription_plan_id, subscription_status, subscription_started_at, status
  )
  VALUES (
    p_name, p_industry, p_description, p_website, p_phone, p_address, p_country, p_timezone,
    p_plan_id, 'active', now(), 'active'
  )
  RETURNING id INTO v_business_id;

  SELECT id INTO v_owner_id FROM profiles WHERE email = p_owner_email;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO business_members (business_id, user_id, role, status)
    VALUES (v_business_id, v_owner_id, 'owner', 'active')
    ON CONFLICT (business_id, user_id) DO NOTHING;

    UPDATE profiles SET active_business_id = v_business_id WHERE id = v_owner_id;
  END IF;

  INSERT INTO business_subscriptions (business_id, plan_id, status, billing_cycle, start_date)
  VALUES (v_business_id, p_plan_id, 'active', p_billing_cycle, now())
  ON CONFLICT (business_id) DO UPDATE SET plan_id = p_plan_id, status = 'active', updated_at = now();

  INSERT INTO ai_provider_settings (business_id) VALUES (v_business_id)
    ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO group_rules (business_id) VALUES (v_business_id)
    ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO integrations (business_id, type, name, status)
  VALUES
    (v_business_id, 'whatsapp', 'WhatsApp', 'not_connected'),
    (v_business_id, 'website_chat', 'Website Chat', 'not_connected'),
    (v_business_id, 'facebook_messenger', 'Facebook Messenger', 'not_connected'),
    (v_business_id, 'instagram', 'Instagram', 'not_connected'),
    (v_business_id, 'linkedin', 'LinkedIn', 'not_connected')
  ON CONFLICT DO NOTHING;

  v_result := jsonb_build_object(
    'business_id', v_business_id,
    'owner_found', v_owner_id IS NOT NULL,
    'owner_id', v_owner_id
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_business_with_plan FROM anon;
GRANT EXECUTE ON FUNCTION create_business_with_plan TO authenticated;

CREATE OR REPLACE FUNCTION update_business_subscription_status(
  p_business_id uuid,
  p_status text,
  p_plan_id uuid DEFAULT NULL,
  p_billing_cycle text DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)) THEN
    RAISE EXCEPTION 'Only super admins can update subscription status';
  END IF;

  UPDATE business_subscriptions
  SET
    status = p_status,
    plan_id = COALESCE(p_plan_id, plan_id),
    billing_cycle = COALESCE(p_billing_cycle, billing_cycle),
    end_date = COALESCE(p_end_date, end_date),
    updated_at = now()
  WHERE business_id = p_business_id;

  UPDATE businesses
  SET
    subscription_status = p_status,
    subscription_plan_id = COALESCE(p_plan_id, subscription_plan_id),
    status = CASE WHEN p_status = 'suspended' THEN 'suspended'
                  WHEN p_status IN ('active', 'trial') THEN 'active'
                  ELSE status END
  WHERE id = p_business_id;

  v_result := jsonb_build_object('success', true, 'business_id', p_business_id, 'status', p_status);
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_business_subscription_status FROM anon;
GRANT EXECUTE ON FUNCTION update_business_subscription_status TO authenticated;

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
  v_result jsonb;
BEGIN
  SELECT subscription_plan_id INTO v_plan_id FROM businesses WHERE id = p_business_id;
  IF v_plan_id IS NULL THEN
    SELECT plan_id INTO v_plan_id FROM business_subscriptions WHERE business_id = p_business_id;
  END IF;
  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'No plan assigned');
  END IF;

  EXECUTE format('SELECT %I FROM subscription_plans WHERE id = $1', p_limit_type)
    INTO v_max USING v_plan_id;

  CASE p_limit_type
    WHEN 'max_agents' THEN
      SELECT count(*) INTO v_current FROM agents WHERE business_id = p_business_id;
    WHEN 'max_team_members' THEN
      SELECT count(*) INTO v_current FROM business_members WHERE business_id = p_business_id AND status = 'active';
    WHEN 'max_leads' THEN
      SELECT count(*) INTO v_current FROM leads WHERE business_id = p_business_id;
    WHEN 'max_appointments' THEN
      SELECT count(*) INTO v_current FROM appointments WHERE business_id = p_business_id;
    WHEN 'max_knowledge_items' THEN
      SELECT count(*) INTO v_current FROM knowledge_items WHERE business_id = p_business_id;
    WHEN 'max_products' THEN
      SELECT count(*) INTO v_current FROM products WHERE business_id = p_business_id;
    WHEN 'max_media_documents' THEN
      SELECT count(*) INTO v_current FROM media_documents WHERE business_id = p_business_id;
    WHEN 'max_integrations' THEN
      SELECT count(*) INTO v_current FROM integrations WHERE business_id = p_business_id;
    ELSE
      RETURN jsonb_build_object('allowed', true, 'error', 'Unknown limit type');
  END CASE;

  v_result := jsonb_build_object(
    'allowed', v_current < v_max,
    'current', v_current,
    'max', v_max,
    'limit_type', p_limit_type
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_plan_limit FROM anon;
GRANT EXECUTE ON FUNCTION check_plan_limit TO authenticated;