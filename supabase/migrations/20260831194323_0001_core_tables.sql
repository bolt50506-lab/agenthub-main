/*
# AgentHub Core Schema - Part 1: Auth, Businesses, Profiles

Creates foundational tables for AgentHub's multi-tenant SaaS:
- profiles: Extended user info linked to auth.users
- businesses: Business/workspace entities (tenants)
- business_members: User-business membership with roles

## Security
- RLS enabled on all tables
- Helper functions for membership/admin checks
- Auto-create profile on signup via trigger
*/

-- ============ TABLES (created first, before policies) ============

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  phone text,
  is_super_admin boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  active_business_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  description text,
  website text,
  phone text,
  address text,
  timezone text NOT NULL DEFAULT 'UTC',
  logo_url text,
  working_hours jsonb NOT NULL DEFAULT '{
    "monday": {"enabled": true, "open": "09:00", "close": "17:00"},
    "tuesday": {"enabled": true, "open": "09:00", "close": "17:00"},
    "wednesday": {"enabled": true, "open": "09:00", "close": "17:00"},
    "thursday": {"enabled": true, "open": "09:00", "close": "17:00"},
    "friday": {"enabled": true, "open": "09:00", "close": "17:00"},
    "saturday": {"enabled": false, "open": "09:00", "close": "17:00"},
    "sunday": {"enabled": false, "open": "09:00", "close": "17:00"}
  }'::jsonb,
  appointment_duration integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);

-- Add FK from profiles to businesses
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_active_business_id_fkey'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_active_business_id_fkey
    FOREIGN KEY (active_business_id) REFERENCES businesses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS idx_business_members_business_id ON business_members(business_id);
CREATE INDEX IF NOT EXISTS idx_business_members_user_id ON business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);

-- ============ RLS ============

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  );

-- Businesses policies
DROP POLICY IF EXISTS "businesses_select_members" ON businesses;
CREATE POLICY "businesses_select_members" ON businesses FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "businesses_update_owners" ON businesses;
CREATE POLICY "businesses_update_owners" ON businesses FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
      AND business_members.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
      AND business_members.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "businesses_select_admin" ON businesses;
CREATE POLICY "businesses_select_admin" ON businesses FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  );

DROP POLICY IF EXISTS "businesses_update_admin" ON businesses;
CREATE POLICY "businesses_update_admin" ON businesses FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  );

DROP POLICY IF EXISTS "businesses_insert_admin" ON businesses;
CREATE POLICY "businesses_insert_admin" ON businesses FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  );

-- Business members policies
DROP POLICY IF EXISTS "business_members_select" ON business_members;
CREATE POLICY "business_members_select" ON business_members FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "business_members_insert" ON business_members;
CREATE POLICY "business_members_insert" ON business_members FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "business_members_update" ON business_members;
CREATE POLICY "business_members_update" ON business_members FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "business_members_delete" ON business_members;
CREATE POLICY "business_members_delete" ON business_members FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "business_members_select_admin" ON business_members;
CREATE POLICY "business_members_select_admin" ON business_members FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
  );

-- ============ HELPER FUNCTIONS ============

CREATE OR REPLACE FUNCTION is_business_member(check_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_business_admin(check_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = check_business_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_super_admin = true
  );
$$;

-- ============ TRIGGERS ============

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS businesses_updated_at ON businesses;
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS business_members_updated_at ON business_members;
CREATE TRIGGER business_members_updated_at BEFORE UPDATE ON business_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
