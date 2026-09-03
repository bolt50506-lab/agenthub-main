ALTER TABLE group_rules DROP CONSTRAINT IF EXISTS group_rules_response_mode_check;
ALTER TABLE group_rules ADD CONSTRAINT group_rules_response_mode_check
  CHECK (response_mode = ANY (ARRAY['reply_to_all'::text, 'disabled'::text, 'price_inquiries_only'::text, 'mentions_only'::text, 'custom_rules'::text]));
