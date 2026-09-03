/*
# Replace businesses RLS policies with non-recursive helper functions

1. Purpose
- The `businesses_select_members` and `businesses_update_owners` policies use
  `EXISTS (SELECT 1 FROM business_members WHERE ...)` which, while not directly
  recursive on `businesses`, triggers `business_members` RLS evaluation.
- Replace with `is_business_member()` and `is_business_admin()` for consistency
  and to avoid any indirect recursion.

2. Security
- No data is deleted or modified.
- Same access semantics: members can SELECT, admins/owners can UPDATE.
*/

DROP POLICY IF EXISTS "businesses_select_members" ON businesses;
CREATE POLICY "businesses_select_members" ON businesses FOR SELECT
  TO authenticated USING (is_business_member(id) OR is_super_admin());

DROP POLICY IF EXISTS "businesses_update_owners" ON businesses;
CREATE POLICY "businesses_update_owners" ON businesses FOR UPDATE
  TO authenticated
  USING (is_business_admin(id) OR is_super_admin())
  WITH CHECK (is_business_admin(id) OR is_super_admin());