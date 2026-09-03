-- Subscription Plans table for tiered pricing
-- Super admin assigns businesses to one of 3 plans

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug IN ('starter', 'professional', 'enterprise')),
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  max_agents integer NOT NULL,
  max_conversations integer, -- NULL = unlimited
  max_team_members integer NOT NULL,
  max_storage_mb integer, -- NULL = unlimited
  features jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add plan reference to businesses
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS subscription_plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active' CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz;

-- RLS on subscription_plans: anyone authenticated can read, only super admin can write
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select" ON subscription_plans;
CREATE POLICY "plans_select" ON subscription_plans FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "plans_insert" ON subscription_plans;
CREATE POLICY "plans_insert" ON subscription_plans FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "plans_update" ON subscription_plans;
CREATE POLICY "plans_update" ON subscription_plans FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "plans_delete" ON subscription_plans;
CREATE POLICY "plans_delete" ON subscription_plans FOR DELETE TO authenticated
  USING (is_super_admin());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed the 3 plans
INSERT INTO subscription_plans (name, slug, price_cents, billing_period, max_agents, max_conversations, max_team_members, max_storage_mb, features, sort_order)
VALUES
  (
    'Starter',
    'starter',
    2900,
    'monthly',
    1,
    500,
    2,
    500,
    '["1 AI Agent","500 conversations/month","2 team members","500 MB storage","Email support","Basic analytics"]'::jsonb,
    1
  ),
  (
    'Professional',
    'professional',
    7900,
    'monthly',
    5,
    5000,
    10,
    5000,
    '["5 AI Agents","5,000 conversations/month","10 team members","5 GB storage","Priority support","Advanced analytics","Custom agent training","Group AI rules","Image analysis"]'::jsonb,
    2
  ),
  (
    'Enterprise',
    'enterprise',
    19900,
    'monthly',
    999,
    NULL,
    999,
    NULL,
    '["Unlimited AI Agents","Unlimited conversations","Unlimited team members","Unlimited storage","24/7 phone support","Custom integrations","Dedicated account manager","SLA guarantee","On-premise deployment option","Custom AI model training"]'::jsonb,
    3
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  billing_period = EXCLUDED.billing_period,
  max_agents = EXCLUDED.max_agents,
  max_conversations = EXCLUDED.max_conversations,
  max_team_members = EXCLUDED.max_team_members,
  max_storage_mb = EXCLUDED.max_storage_mb,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;
