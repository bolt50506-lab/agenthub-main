/*
# Revoke PUBLIC EXECUTE on all SECURITY DEFINER functions

1. Purpose
- Previous revokes from `anon` didn't take effect because PostgreSQL grants EXECUTE to PUBLIC
  by default for functions, and `anon` inherits from PUBLIC.
- Must REVOKE FROM PUBLIC to actually remove the grant.

2. Changes
- REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC for all SECURITY DEFINER functions.
- GRANT EXECUTE TO authenticated so signed-in users can still call them.

3. Security
- No data is deleted or modified.
- Only signed-in users can invoke privileged functions.
*/

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_business_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_business_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_business_with_plan(text, text, text, text, text, text, text, text, text, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_business_subscription_status(uuid, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_plan_limit(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_business_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION create_business_with_plan(text, text, text, text, text, text, text, text, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_business_subscription_status(uuid, text, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION check_plan_limit(uuid, text) TO authenticated;