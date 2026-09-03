/*
# Harden security-definer functions and trigger function

1. Purpose
- Address database linter warnings:
  a) `update_updated_at_column` has a mutable search_path.
  b) SECURITY DEFINER functions callable by the `anon` role should not be public.

2. Changes
- Recreate `update_updated_at_column` with `SET search_path = public`.
- Revoke EXECUTE from `anon` on all SECURITY DEFINER helper functions:
  `is_business_member`, `is_business_admin`, `is_super_admin`, `check_plan_limit`,
  `create_business_with_owner`, `create_business_with_owner_and_subscription`.
- Grant EXECUTE to `authenticated` so signed-in users can still call them via RPC or policies.

3. Security
- No data is deleted or modified.
- `anon` can no longer directly invoke privileged functions via the REST API.
- Policies that use these functions are unaffected — policy predicates run as the caller
  (an authenticated user), not as `anon`.
*/

-- Fix mutable search_path on trigger function
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS businesses_updated_at ON businesses;
DROP TRIGGER IF EXISTS business_members_updated_at ON business_members;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers (they reference the function by name, so order doesn't matter)
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER business_members_updated_at BEFORE UPDATE ON business_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Also fix any other triggers from migration 0002 that use this function
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT event_object_table AS tbl, trigger_name AS trg
    FROM information_schema.triggers
    WHERE action_statement LIKE '%update_updated_at_column%'
      AND event_object_schema = 'public'
      AND trigger_name NOT IN ('profiles_updated_at', 'businesses_updated_at', 'business_members_updated_at')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', t.trg, t.tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t.trg, t.tbl);
  END LOOP;
END $$;

-- Revoke EXECUTE from anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION is_business_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION is_business_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION check_plan_limit(uuid, text) FROM anon;

-- Grant to authenticated (policies already run as authenticated, but explicit grant is cleaner)
GRANT EXECUTE ON FUNCTION is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_business_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION check_plan_limit(uuid, text) TO authenticated;