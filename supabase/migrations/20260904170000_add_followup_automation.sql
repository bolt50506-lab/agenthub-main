-- Automatic follow-up automation settings and task delivery state.
CREATE TABLE IF NOT EXISTS followup_automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  first_delay_hours integer NOT NULL DEFAULT 24,
  second_delay_hours integer NOT NULL DEFAULT 72,
  third_delay_hours integer NOT NULL DEFAULT 168,
  max_followups integer NOT NULL DEFAULT 3,
  stop_on_customer_reply boolean NOT NULL DEFAULT true,
  stop_on_won boolean NOT NULL DEFAULT true,
  channels text[] NOT NULL DEFAULT ARRAY['whatsapp'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE follow_up_tasks
  ADD COLUMN IF NOT EXISTS automation_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_due
  ON follow_up_tasks(status, scheduled_at)
  WHERE status = 'pending';

ALTER TABLE followup_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business members manage followup automation" ON followup_automation_settings;
CREATE POLICY "business members manage followup automation"
ON followup_automation_settings
FOR ALL
USING (EXISTS (
  SELECT 1 FROM business_members bm
  WHERE bm.business_id = followup_automation_settings.business_id
    AND bm.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM business_members bm
  WHERE bm.business_id = followup_automation_settings.business_id
    AND bm.user_id = auth.uid()
));
