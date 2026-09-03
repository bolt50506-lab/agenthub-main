export type UserRole = 'owner' | 'admin' | 'member';

export type AgentStatus = 'active' | 'paused' | 'draft' | 'archived';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_booked'
  | 'proposal'
  | 'won'
  | 'lost';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type FollowUpStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';

export type ConversationType = 'private' | 'group';

export type IntegrationStatus =
  | 'not_connected'
  | 'configuration_required'
  | 'configured'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'paused';

export type WhatsAppConnectionStatus =
  | 'not_started'
  | 'creating_session'
  | 'generating_qr'
  | 'waiting_for_scan'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

export type WhatsAppConnectionMethod = 'cloud_api' | 'qr_code';

export type IntegrationType =
  | 'whatsapp'
  | 'website_chat'
  | 'facebook_messenger'
  | 'instagram'
  | 'linkedin';

export type AIProvider = 'gemini' | 'groq' | 'ollama';

export interface AIProviderConfig {
  id: string;
  provider: AIProvider;
  display_name: string;
  api_key_encrypted: string | null;
  base_url: string | null;
  model: string;
  is_enabled: boolean;
  is_primary: boolean;
  priority: number;
  last_tested_at: string | null;
  last_test_status: 'success' | 'failure' | null;
  last_test_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSession {
  id: string;
  business_id: string;
  integration_id: string;
  connection_method: WhatsAppConnectionMethod;
  session_id: string | null;
  qr_code_url: string | null;
  status: WhatsAppConnectionStatus;
  phone_number: string | null;
  provider_name: string | null;
  error_message: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GroupResponseMode =
  | 'reply_to_all'
  | 'disabled'
  | 'price_inquiries_only'
  | 'mentions_only'
  | 'custom_rules';

export type KnowledgeCategory =
  | 'business_info'
  | 'products'
  | 'services'
  | 'faqs'
  | 'policies'
  | 'documents';

export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'limited' | 'preorder';

export type ProductStatus = 'active' | 'inactive' | 'discontinued';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_configured';

export type VerificationStatus = 'unverified' | 'verified' | 'needs_review';

export type MediaType = 'general' | 'product_image' | 'document' | 'prescription' | 'scanned' | 'other';

export type PlanSlug = 'starter' | 'professional' | 'enterprise';

export type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'cancelled' | 'expired';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: PlanSlug;
  price_cents: number;
  yearly_price_cents: number;
  currency: string;
  billing_period: string;
  description: string | null;
  max_agents: number;
  max_conversations: number | null;
  max_team_members: number;
  max_leads: number;
  max_appointments: number;
  max_knowledge_items: number;
  max_products: number;
  max_media_documents: number;
  max_integrations: number;
  max_ai_usage_per_month: number | null;
  max_storage_mb: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_super_admin: boolean;
  onboarding_completed: boolean;
  active_business_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  timezone: string;
  logo_url: string | null;
  working_hours: Record<string, { enabled: boolean; open: string; close: string }>;
  appointment_duration: number;
  status: string;
  subscription_plan_id: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: UserRole;
  invited_by: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

export interface Agent {
  id: string;
  business_id: string;
  name: string;
  purpose: string;
  description: string | null;
  communication_style: string | null;
  primary_goal: string | null;
  supported_languages: string[];
  status: AgentStatus;
  ai_provider: string | null;
  knowledge_source_ids: string[];
  enabled_capabilities: string[];
  created_at: string;
  updated_at: string;
}

export interface AgentSettings {
  id: string;
  agent_id: string;
  business_id: string;
  tone: string;
  greeting_behavior: string | null;
  auto_create_leads: boolean;
  appointments_enabled: boolean;
  auto_followups_enabled: boolean;
  max_response_length: number;
  response_language: string;
  custom_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  agent_id: string | null;
  customer_id: string | null;
  type: ConversationType;
  title: string | null;
  external_id: string | null;
  channel: string;
  ai_enabled: boolean;
  status: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  business_id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system' | 'business';
  sender_id: string | null;
  content: string;
  content_type: string;
  media_url: string | null;
  metadata: Record<string, unknown>;
  is_inbound: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  business_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  interested_product: string | null;
  budget: string | null;
  location: string | null;
  requirement: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  conversation_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  business_id: string;
  created_by: string | null;
  content: string;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  business_id: string;
  activity_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  customer_id: string | null;
  lead_id: string | null;
  customer_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpTask {
  id: string;
  business_id: string;
  lead_id: string | null;
  appointment_id: string | null;
  task_type: string;
  scheduled_at: string;
  status: FollowUpStatus;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpHistory {
  id: string;
  follow_up_id: string;
  business_id: string;
  action: string;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  business_id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  price: number | null;
  currency: string;
  availability: ProductAvailability;
  status: ProductStatus;
  image_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MediaDocument {
  id: string;
  business_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  mime_type: string | null;
  category: MediaType;
  uploaded_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ImageAnalysisResult {
  id: string;
  business_id: string;
  media_document_id: string;
  extracted_text: string | null;
  confidence: ConfidenceLevel | null;
  uncertain_segments: Array<{ text: string; note: string }>;
  processing_status: ProcessingStatus;
  verification_status: VerificationStatus;
  corrected_text: string | null;
  analyzed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  business_id: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIProviderSettings {
  id: string;
  business_id: string;
  primary_provider: AIProvider;
  fallback_provider: AIProvider | null;
  ollama_url: string | null;
  model_name: string | null;
  temperature: number;
  max_tokens: number;
  is_configured: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  business_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  business_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BusinessSubscription {
  id: string;
  business_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: 'monthly' | 'yearly';
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan | null;
}

export interface GroupRules {
  id: string;
  business_id: string;
  agent_id: string | null;
  group_ai_enabled: boolean;
  response_mode: GroupResponseMode;
  allowed_category_ids: string[];
  allowed_product_ids: string[];
  allow_price_list: boolean;
  allow_quotation: boolean;
  require_product_name: boolean;
  response_language: string;
  max_response_length: number;
  custom_rules: Array<{ condition: string; action: string }>;
  created_at: string;
  updated_at: string;
}

export const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'contacted', label: 'Contacted', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { value: 'qualified', label: 'Qualified', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  { value: 'appointment_booked', label: 'Appointment Booked', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'proposal', label: 'Proposal', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'won', label: 'Won', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

export const APPOINTMENT_STATUSES: { value: AppointmentStatus; label: string; color: string }[] = [
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'completed', label: 'Completed', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'no_show', label: 'No Show', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
];

export const FOLLOWUP_STATUSES: { value: FollowUpStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  { value: 'overdue', label: 'Overdue', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

export const AGENT_CAPABILITIES = [
  { value: 'search_knowledge', label: 'Search Knowledge Base' },
  { value: 'search_products', label: 'Search Products' },
  { value: 'search_prices', label: 'Search Prices' },
  { value: 'create_lead', label: 'Create Lead' },
  { value: 'update_lead', label: 'Update Lead' },
  { value: 'check_appointment_availability', label: 'Check Appointment Availability' },
  { value: 'create_appointment', label: 'Create Appointment' },
  { value: 'create_followup', label: 'Create Follow-up' },
  { value: 'analyze_image', label: 'Analyze Image' },
  { value: 'analyze_document', label: 'Analyze Document' },
];

export const AGENT_GOALS = [
  { value: 'sales', label: 'Sales' },
  { value: 'customer_support', label: 'Customer Support' },
  { value: 'lead_generation', label: 'Lead Generation' },
  { value: 'appointment_booking', label: 'Appointment Booking' },
  { value: 'pharmacy_assistant', label: 'Pharmacy Assistant' },
  { value: 'product_inquiry', label: 'Product Inquiry' },
  { value: 'custom', label: 'Custom' },
];
