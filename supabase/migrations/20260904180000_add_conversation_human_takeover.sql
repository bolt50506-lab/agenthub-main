/* Conversation-level human takeover.
   AI is the default. A dashboard/manual business reply switches one
   conversation to human mode; customer messages continue to be stored,
   but inbound handlers must not generate or send AI replies until resumed.
*/

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS human_takeover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_takeover_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_takeover_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_human_takeover
  ON conversations(business_id, human_takeover)
  WHERE human_takeover = true;
