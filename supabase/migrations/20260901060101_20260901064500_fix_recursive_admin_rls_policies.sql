/*
# Fix recursive admin RLS policies

1. Purpose
- Resolve the `infinite recursion detected in policy for relation profiles` error.
- Replace policy predicates that query `profiles` directly with the existing `is_super_admin()` security-definer function.

2. Modified policies
- `profiles_select_admin`: admin profile access now uses `is_super_admin()`.
- `businesses_select_admin`: admin business access now uses `is_super_admin()`.
- `businesses_update_admin`: admin business updates now use `is_super_admin()`.
- `businesses_insert_admin`: admin business creation now uses `is_super_admin()`.
- `business_members_select_admin`: admin membership access now uses `is_super_admin()`.

3. Security
- No tables, columns, or user data are deleted or changed.
- Super-admin access remains limited to authenticated users whose immutable database profile has `is_super_admin = true`.
- The existing `is_super_admin()` function is security-definer and has a fixed `public` search path, so it can check the admin flag without recursively re-entering the `profiles` RLS policy.
*/

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "businesses_select_admin" ON businesses;
CREATE POLICY "businesses_select_admin" ON businesses FOR SELECT
  TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "businesses_update_admin" ON businesses;
CREATE POLICY "businesses_update_admin" ON businesses FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "businesses_insert_admin" ON businesses;
CREATE POLICY "businesses_insert_admin" ON businesses FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "business_members_select_admin" ON business_members;
CREATE POLICY "business_members_select_admin" ON business_members FOR SELECT
  TO authenticated USING (is_super_admin());