/*
# Revoke anon EXECUTE on all SECURITY DEFINER functions

1. Purpose
- Address all remaining linter warnings: SECURITY DEFINER functions callable by the `anon` role.

2. Changes
- Revoke EXECUTE from `anon` on all SECURITY DEFINER functions in the public schema.
- Grant EXECUTE to `authenticated` where not already granted.
- Functions affected: handle_new_user, is_business_member, is_business_admin, is_super_admin,
  create_business_with_plan, update_business_subscription_status, check_plan_limit.

3. Security
- No data is deleted or modified.
- Only signed-in users can invoke privileged functions. Anonymous API calls are blocked.
- handle_new_user is a trigger function (called by the database, not via API), so revoking
  anon EXECUTE is safe — triggers run with the function's privileges regardless of caller role.
*/

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION is_business_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION is_business_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION create_business_with_plan(text, text, text, text, text, text, text, text, text, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION update_business_subscription_status(uuid, text, uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION check_plan_limit(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_business_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION create_business_with_plan(text, text, text, text, text, text, text, text, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_business_subscription_status(uuid, text, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION check_plan_limit(uuid, text) TO authenticated;