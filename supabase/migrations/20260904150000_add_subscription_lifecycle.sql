-- Subscription lifecycle: expiry, 10-day grace period and reminder tracking.
ALTER TABLE business_subscriptions
  ADD COLUMN IF NOT EXISTS grace_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_grace_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status_end_date
  ON business_subscriptions(status, end_date);

-- Use this view for lifecycle checks and dashboard status.
CREATE OR REPLACE VIEW subscription_lifecycle_status AS
SELECT
  bs.id,
  bs.business_id,
  bs.status,
  bs.billing_cycle,
  bs.start_date,
  bs.end_date,
  bs.grace_end_date,
  CASE
    WHEN bs.status IN ('cancelled','expired','suspended') THEN 'inactive'
    WHEN bs.end_date IS NULL OR bs.end_date >= now() THEN 'active'
    WHEN bs.grace_end_date IS NOT NULL AND bs.grace_end_date >= now() THEN 'grace'
    ELSE 'expired'
  END AS lifecycle_status
FROM business_subscriptions bs;
