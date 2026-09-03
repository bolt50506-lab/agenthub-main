-- SECURITY DEFINER function for super admin business creation
-- Solves RLS blocking: super admin can insert business + members + settings + integrations
-- and set the owner's active_business_id, all in one atomic call.

CREATE OR REPLACE FUNCTION create_business_with_plan(
  p_name text,
  p_industry text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_plan_id uuid DEFAULT NULL
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
  -- Only super admins can call this
  IF NOT (SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)) THEN
    RAISE EXCEPTION 'Only super admins can create businesses';
  END IF;

  -- Create the business
  INSERT INTO businesses (name, industry, subscription_plan_id, subscription_status, subscription_started_at)
  VALUES (p_name, p_industry, p_plan_id, 'active', now())
  RETURNING id INTO v_business_id;

  -- Look up owner by email
  SELECT id INTO v_owner_id FROM profiles WHERE email = p_owner_email;

  IF v_owner_id IS NOT NULL THEN
    -- Add as owner member
    INSERT INTO business_members (business_id, user_id, role, status)
    VALUES (v_business_id, v_owner_id, 'owner', 'active')
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- Set active business
    UPDATE profiles SET active_business_id = v_business_id WHERE id = v_owner_id;
  END IF;

  -- Create default settings
  INSERT INTO ai_provider_settings (business_id) VALUES (v_business_id)
    ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO group_rules (business_id) VALUES (v_business_id)
    ON CONFLICT (business_id) DO NOTHING;

  -- Create default integrations
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

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION create_business_with_plan(text, text, text, uuid) TO authenticated;

-- Also add a policy allowing super admins to insert business_members
-- (so the RPC function works even if SECURITY DEFINER bypass isn't enough for nested RLS)
DROP POLICY IF EXISTS "business_members_insert_admin" ON business_members;
CREATE POLICY "business_members_insert_admin" ON business_members FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- Allow super admins to update business_members
DROP POLICY IF EXISTS "business_members_update_admin" ON business_members;
CREATE POLICY "business_members_update_admin" ON business_members FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Allow super admins to delete business_members
DROP POLICY IF EXISTS "business_members_delete_admin" ON business_members;
CREATE POLICY "business_members_delete_admin" ON business_members FOR DELETE TO authenticated
  USING (is_super_admin());

-- Allow super admins to insert/update ai_provider_settings, group_rules, integrations
DROP POLICY IF EXISTS "ai_provider_insert_admin" ON ai_provider_settings;
CREATE POLICY "ai_provider_insert_admin" ON ai_provider_settings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "group_rules_insert_admin" ON group_rules;
CREATE POLICY "group_rules_insert_admin" ON group_rules FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "integrations_insert_admin" ON integrations;
CREATE POLICY "integrations_insert_admin" ON integrations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- Allow super admins to update profiles (for setting active_business_id on other users)
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
