-- ============ AI PROVIDER CONFIGS ============
-- Stores global AI provider credentials managed by super admin
-- Secrets are stored encrypted (api_key_encrypted) and never exposed to business users

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gemini', 'groq', 'ollama')),
  display_name text NOT NULL DEFAULT '',
  api_key_encrypted text,
  base_url text,
  model text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IN ('success', 'failure')),
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage AI provider configs
CREATE POLICY "ai_provider_configs_select_admin" ON ai_provider_configs
  FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "ai_provider_configs_insert_admin" ON ai_provider_configs
  FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "ai_provider_configs_update_admin" ON ai_provider_configs
  FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "ai_provider_configs_delete_admin" ON ai_provider_configs
  FOR DELETE TO authenticated USING (is_super_admin());

-- ============ WHATSAPP SESSIONS ============
-- Tracks WhatsApp QR-code connection sessions per business
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  connection_method text NOT NULL DEFAULT 'qr_code' CHECK (connection_method IN ('cloud_api', 'qr_code')),
  session_id text,
  qr_code_url text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'creating_session', 'generating_qr', 'waiting_for_scan',
    'connecting', 'connected', 'error', 'disconnected'
  )),
  phone_number text,
  provider_name text,
  error_message text,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_business ON whatsapp_sessions(business_id);

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_sessions_select" ON whatsapp_sessions
  FOR SELECT TO authenticated USING (is_business_member(business_id) OR is_super_admin());
CREATE POLICY "whatsapp_sessions_insert" ON whatsapp_sessions
  FOR INSERT TO authenticated WITH CHECK (is_business_admin(business_id) OR is_super_admin());
CREATE POLICY "whatsapp_sessions_update" ON whatsapp_sessions
  FOR UPDATE TO authenticated USING (is_business_admin(business_id) OR is_super_admin())
  WITH CHECK (is_business_admin(business_id) OR is_super_admin());
CREATE POLICY "whatsapp_sessions_delete" ON whatsapp_sessions
  FOR DELETE TO authenticated USING (is_business_admin(business_id) OR is_super_admin());

-- ============ UPDATE INTEGRATION STATUS ============
-- Add new status values to integrations table
-- The status column is text so new values work without enum changes
-- Just need to ensure existing 'configuration_required' records are still valid

-- ============ WIDGET CONFIG ============
-- Add allowed_domains to website_chat integration config (stored in config jsonb)
-- No schema change needed - config is jsonb

-- Insert default AI provider config rows
INSERT INTO ai_provider_configs (provider, display_name, model, is_enabled, is_primary, priority)
VALUES
  ('gemini', 'Google Gemini', 'gemini-1.5-flash', false, true, 1),
  ('groq', 'Groq', 'llama-3.3-70b-versatile', false, false, 2),
  ('ollama', 'Ollama', 'llama3.2', false, false, 3)
ON CONFLICT (provider) DO NOTHING;