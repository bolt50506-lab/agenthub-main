/*
# Fix recursive business_members RLS policies

1. Purpose
- The `business_members_select` policy queries `business_members` from within its own
  RLS policy, causing infinite recursion: `EXISTS (SELECT 1 FROM business_members bm WHERE ...)`.
- Same issue affects `business_members_update` and `business_members_delete` policies.
- Replace all recursive self-references with the existing `is_business_member()` and
  `is_business_admin()` SECURITY DEFINER functions, which bypass RLS.

2. Changes
- Recreate `business_members_select` to use `is_business_member(business_id)`.
- Recreate `business_members_update` to use `is_business_admin(business_id)`.
- Recreate `business_members_delete` to use `is_business_admin(business_id)`.
- Keep the admin-level policies that use `is_super_admin()` (already non-recursive).

3. Security
- No data is deleted or modified.
- Owners can still see their own memberships.
- Admins/owners can still update/delete members within their business.
- Super admins retain full access.
*/

-- SELECT: members can see their own business memberships
DROP POLICY IF EXISTS "business_members_select" ON business_members;
CREATE POLICY "business_members_select" ON business_members FOR SELECT
  TO authenticated USING (is_business_member(business_id) OR is_super_admin());

-- Drop the separate admin select policy (now merged above)
DROP POLICY IF EXISTS "business_members_select_admin" ON business_members;

-- UPDATE: business admins/owners can update memberships
DROP POLICY IF EXISTS "business_members_update" ON business_members;
CREATE POLICY "business_members_update" ON business_members FOR UPDATE
  TO authenticated
  USING (is_business_admin(business_id) OR is_super_admin())
  WITH CHECK (is_business_admin(business_id) OR is_super_admin());

DROP POLICY IF EXISTS "business_members_update_admin" ON business_members;

-- DELETE: business admins/owners can remove members
DROP POLICY IF EXISTS "business_members_delete" ON business_members;
CREATE POLICY "business_members_delete" ON business_members FOR DELETE
  TO authenticated USING (is_business_admin(business_id) OR is_super_admin());

DROP POLICY IF EXISTS "business_members_delete_admin" ON business_members;

-- INSERT: any authenticated user can add themselves as a member (for self-join flows)
-- Admins can also add members via the edge function (service role bypasses RLS)
DROP POLICY IF EXISTS "business_members_insert" ON business_members;
CREATE POLICY "business_members_insert" ON business_members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_super_admin());

DROP POLICY IF EXISTS "business_members_insert_admin" ON business_members;