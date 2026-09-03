/*
# AgentHub Core Schema - Part 2: Business Domain Tables

Creates all business-domain tables with business_id tenant isolation:
- agents, agent_settings: AI agent management
- customers: Customer/contact records
- conversations, messages: Chat history (private + group)
- leads, lead_notes, lead_activities: Lead management
- appointments: Booking system
- follow_up_tasks, follow_up_history: Follow-up automation
- knowledge_items: Knowledge base for RAG
- products, product_categories: Product/service catalog
- media_documents, image_analysis_results: File storage + analysis
- integrations, integration_settings: Channel connections
- ai_provider_settings: Per-business AI config
- activity_logs: Audit trail
- notifications: User notifications
- group_rules: WhatsApp group AI behavior rules

## Security
- RLS enabled on all tables
- All business-scoped tables use is_business_member() for SELECT
- Admin actions (INSERT/UPDATE/DELETE) use is_business_admin()
- Super admins have read access to all tables
*/

-- ============ AGENTS ============

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text NOT NULL,
  description text,
  communication_style text,
  primary_goal text,
  supported_languages text[] NOT NULL DEFAULT ARRAY['English'],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft', 'archived')),
  ai_provider text DEFAULT 'gemini',
  knowledge_source_ids uuid[] DEFAULT '{}',
  enabled_capabilities text[] NOT NULL DEFAULT ARRAY['search_knowledge', 'search_products'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tone text NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'casual', 'formal')),
  greeting_behavior text,
  auto_create_leads boolean NOT NULL DEFAULT true,
  appointments_enabled boolean NOT NULL DEFAULT true,
  auto_followups_enabled boolean NOT NULL DEFAULT false,
  max_response_length integer DEFAULT 500,
  response_language text NOT NULL DEFAULT 'English',
  custom_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CUSTOMERS ============

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  external_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CONVERSATIONS & MESSAGES ============

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'private' CHECK (type IN ('private', 'group')),
  title text,
  external_id text,
  channel text DEFAULT 'whatsapp',
  ai_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'agent', 'system', 'business')),
  sender_id uuid,
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video')),
  media_url text,
  metadata jsonb DEFAULT '{}',
  is_inbound boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ LEADS ============

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  source text DEFAULT 'manual',
  interested_product text,
  budget text,
  location text,
  requirement text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'appointment_booked', 'proposal', 'won', 'lost')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ APPOINTMENTS ============

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_name text,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ FOLLOW-UPS ============

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'call' CHECK (task_type IN ('call', 'email', 'message', 'meeting', 'custom')),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_up_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  action text NOT NULL,
  notes text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ KNOWLEDGE BASE ============

CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'business_info' CHECK (category IN ('business_info', 'products', 'services', 'faqs', 'policies', 'documents')),
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ PRODUCTS ============

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  sku text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  availability text NOT NULL DEFAULT 'in_stock' CHECK (availability IN ('in_stock', 'out_of_stock', 'limited', 'preorder')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  image_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ MEDIA & DOCUMENTS ============

CREATE TABLE IF NOT EXISTS media_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size bigint,
  mime_type text,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'product_image', 'document', 'prescription', 'scanned', 'other')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  media_document_id uuid NOT NULL REFERENCES media_documents(id) ON DELETE CASCADE,
  extracted_text text,
  confidence text CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  uncertain_segments jsonb DEFAULT '[]',
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'not_configured')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'needs_review')),
  corrected_text text,
  analyzed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ INTEGRATIONS ============

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('whatsapp', 'website_chat', 'facebook_messenger', 'instagram', 'linkedin')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'configuration_required', 'connected', 'error', 'paused')),
  config jsonb DEFAULT '{}',
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL UNIQUE REFERENCES integrations(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ AI PROVIDER SETTINGS ============

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  primary_provider text NOT NULL DEFAULT 'gemini' CHECK (primary_provider IN ('gemini', 'groq', 'ollama')),
  fallback_provider text CHECK (fallback_provider IN ('gemini', 'groq', 'ollama')),
  ollama_url text,
  model_name text,
  temperature numeric(3,2) DEFAULT 0.7,
  max_tokens integer DEFAULT 1024,
  is_configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ACTIVITY LOGS ============

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ NOTIFICATIONS ============

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GROUP RULES ============

CREATE TABLE IF NOT EXISTS group_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  group_ai_enabled boolean NOT NULL DEFAULT false,
  response_mode text NOT NULL DEFAULT 'disabled' CHECK (response_mode IN ('disabled', 'price_inquiries_only', 'mentions_only', 'custom_rules')),
  allowed_category_ids uuid[] DEFAULT '{}',
  allowed_product_ids uuid[] DEFAULT '{}',
  allow_price_list boolean NOT NULL DEFAULT true,
  allow_quotation boolean NOT NULL DEFAULT false,
  require_product_name boolean NOT NULL DEFAULT true,
  response_language text NOT NULL DEFAULT 'English',
  max_response_length integer DEFAULT 300,
  custom_rules jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS idx_agents_business_id ON agents(business_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_business_id ON leads(business_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_business_id ON appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_business_id ON follow_up_tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_status ON follow_up_tasks(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_business_id ON knowledge_items(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_category ON knowledge_items(category);
CREATE INDEX IF NOT EXISTS idx_products_business_id ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_business_id ON product_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_media_documents_business_id ON media_documents(business_id);
CREATE INDEX IF NOT EXISTS idx_image_analysis_business_id ON image_analysis_results(business_id);
CREATE INDEX IF NOT EXISTS idx_integrations_business_id ON integrations(business_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
CREATE INDEX IF NOT EXISTS idx_ai_provider_business_id ON ai_provider_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_business_id ON activity_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_group_rules_business_id ON group_rules(business_id);

-- ============ RLS: Enable on all tables ============

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_rules ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============
-- Pattern: business members can SELECT, admins can INSERT/UPDATE/DELETE, super admins can SELECT all

-- AGENTS
DROP POLICY IF EXISTS "agents_select" ON agents;
CREATE POLICY "agents_select" ON agents FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "agents_insert" ON agents;
CREATE POLICY "agents_insert" ON agents FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "agents_update" ON agents;
CREATE POLICY "agents_update" ON agents FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "agents_delete" ON agents;
CREATE POLICY "agents_delete" ON agents FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- AGENT_SETTINGS
DROP POLICY IF EXISTS "agent_settings_select" ON agent_settings;
CREATE POLICY "agent_settings_select" ON agent_settings FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "agent_settings_insert" ON agent_settings;
CREATE POLICY "agent_settings_insert" ON agent_settings FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "agent_settings_update" ON agent_settings;
CREATE POLICY "agent_settings_update" ON agent_settings FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "agent_settings_delete" ON agent_settings;
CREATE POLICY "agent_settings_delete" ON agent_settings FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- CUSTOMERS
DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_delete" ON customers FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- CONVERSATIONS
DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "conversations_update" ON conversations;
CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "conversations_delete" ON conversations;
CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- MESSAGES
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- LEADS
DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "leads_insert" ON leads;
CREATE POLICY "leads_insert" ON leads FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "leads_delete" ON leads;
CREATE POLICY "leads_delete" ON leads FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- LEAD_NOTES
DROP POLICY IF EXISTS "lead_notes_select" ON lead_notes;
CREATE POLICY "lead_notes_select" ON lead_notes FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "lead_notes_insert" ON lead_notes;
CREATE POLICY "lead_notes_insert" ON lead_notes FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "lead_notes_update" ON lead_notes;
CREATE POLICY "lead_notes_update" ON lead_notes FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "lead_notes_delete" ON lead_notes;
CREATE POLICY "lead_notes_delete" ON lead_notes FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- LEAD_ACTIVITIES
DROP POLICY IF EXISTS "lead_activities_select" ON lead_activities;
CREATE POLICY "lead_activities_select" ON lead_activities FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "lead_activities_insert" ON lead_activities;
CREATE POLICY "lead_activities_insert" ON lead_activities FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "lead_activities_update" ON lead_activities;
CREATE POLICY "lead_activities_update" ON lead_activities FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "lead_activities_delete" ON lead_activities;
CREATE POLICY "lead_activities_delete" ON lead_activities FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- APPOINTMENTS
DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "appointments_insert" ON appointments;
CREATE POLICY "appointments_insert" ON appointments FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "appointments_update" ON appointments;
CREATE POLICY "appointments_update" ON appointments FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "appointments_delete" ON appointments;
CREATE POLICY "appointments_delete" ON appointments FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- FOLLOW_UP_TASKS
DROP POLICY IF EXISTS "follow_up_tasks_select" ON follow_up_tasks;
CREATE POLICY "follow_up_tasks_select" ON follow_up_tasks FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "follow_up_tasks_insert" ON follow_up_tasks;
CREATE POLICY "follow_up_tasks_insert" ON follow_up_tasks FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "follow_up_tasks_update" ON follow_up_tasks;
CREATE POLICY "follow_up_tasks_update" ON follow_up_tasks FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "follow_up_tasks_delete" ON follow_up_tasks;
CREATE POLICY "follow_up_tasks_delete" ON follow_up_tasks FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- FOLLOW_UP_HISTORY
DROP POLICY IF EXISTS "follow_up_history_select" ON follow_up_history;
CREATE POLICY "follow_up_history_select" ON follow_up_history FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "follow_up_history_insert" ON follow_up_history;
CREATE POLICY "follow_up_history_insert" ON follow_up_history FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "follow_up_history_delete" ON follow_up_history;
CREATE POLICY "follow_up_history_delete" ON follow_up_history FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- KNOWLEDGE_ITEMS
DROP POLICY IF EXISTS "knowledge_items_select" ON knowledge_items;
CREATE POLICY "knowledge_items_select" ON knowledge_items FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "knowledge_items_insert" ON knowledge_items;
CREATE POLICY "knowledge_items_insert" ON knowledge_items FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "knowledge_items_update" ON knowledge_items;
CREATE POLICY "knowledge_items_update" ON knowledge_items FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "knowledge_items_delete" ON knowledge_items;
CREATE POLICY "knowledge_items_delete" ON knowledge_items FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- PRODUCTS
DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- PRODUCT_CATEGORIES
DROP POLICY IF EXISTS "product_categories_select" ON product_categories;
CREATE POLICY "product_categories_select" ON product_categories FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "product_categories_insert" ON product_categories;
CREATE POLICY "product_categories_insert" ON product_categories FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "product_categories_update" ON product_categories;
CREATE POLICY "product_categories_update" ON product_categories FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "product_categories_delete" ON product_categories;
CREATE POLICY "product_categories_delete" ON product_categories FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- MEDIA_DOCUMENTS
DROP POLICY IF EXISTS "media_documents_select" ON media_documents;
CREATE POLICY "media_documents_select" ON media_documents FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "media_documents_insert" ON media_documents;
CREATE POLICY "media_documents_insert" ON media_documents FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "media_documents_update" ON media_documents;
CREATE POLICY "media_documents_update" ON media_documents FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "media_documents_delete" ON media_documents;
CREATE POLICY "media_documents_delete" ON media_documents FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- IMAGE_ANALYSIS_RESULTS
DROP POLICY IF EXISTS "image_analysis_select" ON image_analysis_results;
CREATE POLICY "image_analysis_select" ON image_analysis_results FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "image_analysis_insert" ON image_analysis_results;
CREATE POLICY "image_analysis_insert" ON image_analysis_results FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "image_analysis_update" ON image_analysis_results;
CREATE POLICY "image_analysis_update" ON image_analysis_results FOR UPDATE TO authenticated
  USING (is_business_member(business_id)) WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "image_analysis_delete" ON image_analysis_results;
CREATE POLICY "image_analysis_delete" ON image_analysis_results FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- INTEGRATIONS
DROP POLICY IF EXISTS "integrations_select" ON integrations;
CREATE POLICY "integrations_select" ON integrations FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "integrations_insert" ON integrations;
CREATE POLICY "integrations_insert" ON integrations FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "integrations_update" ON integrations;
CREATE POLICY "integrations_update" ON integrations FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "integrations_delete" ON integrations;
CREATE POLICY "integrations_delete" ON integrations FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- INTEGRATION_SETTINGS
DROP POLICY IF EXISTS "integration_settings_select" ON integration_settings;
CREATE POLICY "integration_settings_select" ON integration_settings FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "integration_settings_insert" ON integration_settings;
CREATE POLICY "integration_settings_insert" ON integration_settings FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "integration_settings_update" ON integration_settings;
CREATE POLICY "integration_settings_update" ON integration_settings FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "integration_settings_delete" ON integration_settings;
CREATE POLICY "integration_settings_delete" ON integration_settings FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- AI_PROVIDER_SETTINGS
DROP POLICY IF EXISTS "ai_provider_select" ON ai_provider_settings;
CREATE POLICY "ai_provider_select" ON ai_provider_settings FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "ai_provider_insert" ON ai_provider_settings;
CREATE POLICY "ai_provider_insert" ON ai_provider_settings FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "ai_provider_update" ON ai_provider_settings;
CREATE POLICY "ai_provider_update" ON ai_provider_settings FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "ai_provider_delete" ON ai_provider_settings;
CREATE POLICY "ai_provider_delete" ON ai_provider_settings FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- ACTIVITY_LOGS
DROP POLICY IF EXISTS "activity_logs_select" ON activity_logs;
CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "activity_logs_insert" ON activity_logs;
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "activity_logs_delete" ON activity_logs;
CREATE POLICY "activity_logs_delete" ON activity_logs FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_super_admin());
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (is_business_member(business_id));
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_super_admin());

-- GROUP_RULES
DROP POLICY IF EXISTS "group_rules_select" ON group_rules;
CREATE POLICY "group_rules_select" ON group_rules FOR SELECT TO authenticated
  USING (is_business_member(business_id) OR is_super_admin());
DROP POLICY IF EXISTS "group_rules_insert" ON group_rules;
CREATE POLICY "group_rules_insert" ON group_rules FOR INSERT TO authenticated
  WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "group_rules_update" ON group_rules;
CREATE POLICY "group_rules_update" ON group_rules FOR UPDATE TO authenticated
  USING (is_business_admin(business_id)) WITH CHECK (is_business_admin(business_id));
DROP POLICY IF EXISTS "group_rules_delete" ON group_rules;
CREATE POLICY "group_rules_delete" ON group_rules FOR DELETE TO authenticated
  USING (is_business_admin(business_id));

-- ============ TRIGGERS for updated_at ============

DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS agent_settings_updated_at ON agent_settings;
CREATE TRIGGER agent_settings_updated_at BEFORE UPDATE ON agent_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS appointments_updated_at ON appointments;
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS follow_up_tasks_updated_at ON follow_up_tasks;
CREATE TRIGGER follow_up_tasks_updated_at BEFORE UPDATE ON follow_up_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS knowledge_items_updated_at ON knowledge_items;
CREATE TRIGGER knowledge_items_updated_at BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS product_categories_updated_at ON product_categories;
CREATE TRIGGER product_categories_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS image_analysis_updated_at ON image_analysis_results;
CREATE TRIGGER image_analysis_updated_at BEFORE UPDATE ON image_analysis_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS integrations_updated_at ON integrations;
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS integration_settings_updated_at ON integration_settings;
CREATE TRIGGER integration_settings_updated_at BEFORE UPDATE ON integration_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS ai_provider_updated_at ON ai_provider_settings;
CREATE TRIGGER ai_provider_updated_at BEFORE UPDATE ON ai_provider_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS group_rules_updated_at ON group_rules;
CREATE TRIGGER group_rules_updated_at BEFORE UPDATE ON group_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
