import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';
import { shouldReplyInGroup } from '@/lib/group-rules';
import { detectAppointmentRequest } from '@/lib/appointments';
import { buildLanguageInstruction, detectReplyLanguage } from '@/lib/ai/language';

export const dynamic = 'force-dynamic';

function isWhatsAppGroup(from: string) { return from.endsWith('@g.us'); }
function isWhatsAppLid(from: string) { return from.endsWith('@lid'); }
function resolvePhoneNumber(from: string, phoneNumberFromBody: string) {
  if (phoneNumberFromBody) return phoneNumberFromBody;
  if (isWhatsAppLid(from)) return null;
  const derived = from.replace('@s.whatsapp.net', '').replace('@c.us', '').trim();
  return derived || null;
}
function analyzeCustomerIntent(text: string) {
  const t = text.toLowerCase();
  const human = /\b(human|person|agent|representative|manager|call me|baat karni|insan|banday|banda)\b/i.test(text);
  const complaint = /\b(complaint|fraud|scam|angry|upset|worst|bad service|refund|dhoka|shikayat|ghussa)\b/i.test(text);
  const buying = /\b(buy|purchase|start|subscribe|order|book|payment|pay|price|cost|quote|demo|signup|sign up|khareed|lena|shuru|booking|payment|rate)\b/i.test(text);
  const hesitation = /\b(not interested|later|think about|too expensive|mehnga|mehngi|soch|abhi nahi|budget)\b/i.test(text);
  const followup = /\b(tomorrow|kal|later|baad mein|next week|phir)\b/i.test(text);
  const conversion = /\b(i('m| am)? ready|let's do it|lets do it|i want to buy|payment done|paid|purchase now|subscribe now|shuru karein|kar do|ready hoon)\b/i.test(text);
  const lowConfidence = text.trim().length < 2 || /^(\?|help|hmm|ok|okay)$/i.test(text.trim());
  return { human, complaint, buying, hesitation, followup, conversion, lowConfidence };
}

async function createBusinessNotifications(supabase: any, businessId: string, type: string, title: string, message: string, metadata: Record<string, unknown>) {
  try {
    const { data: members } = await supabase.from('business_members').select('user_id').eq('business_id', businessId).eq('status', 'active');
    const rows = (members || []).map((m: any) => ({ business_id: businessId, user_id: m.user_id, type, title, message, metadata }));
    if (rows.length) await supabase.from('notifications').insert(rows);
  } catch (error) {
    console.error('[WhatsApp API] Notification persistence failed', error);
  }
}

function buildCustomerMemory(existing: Record<string, unknown> | null | undefined, language: string, intent: ReturnType<typeof analyzeCustomerIntent>, message: string) {
  const memory = { ...(existing || {}) } as Record<string, unknown>;
  const previousObjections = Array.isArray(memory.objections) ? memory.objections as string[] : [];
  if (intent.hesitation) memory.objections = Array.from(new Set([...previousObjections, message.slice(0, 500)])).slice(-10);
  memory.preferred_language = language;
  memory.buying_stage = intent.conversion ? 'ready_to_convert' : intent.buying ? 'high_intent' : intent.hesitation ? 'objection' : memory.buying_stage || 'exploring';
  memory.last_intent = intent;
  memory.last_customer_message_at = new Date().toISOString();
  return memory;
}

function limitText(text: string, maxLength?: number | null) {
  if (!maxLength || maxLength <= 0 || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.AGENTHUB_WEBHOOK_SECRET || '';
    if (expectedSecret && req.headers.get('authorization') !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ success: false, reply: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const from = typeof body.from === 'string' ? body.from.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const pushName = typeof body.push_name === 'string' && body.push_name.trim() ? body.push_name.trim() : null;
    const phoneNumberFromBody = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
    const whatsappMessageId = typeof body.message_id === 'string' && body.message_id.trim() ? body.message_id.trim() : null;
    const inputType = body.input_type === 'voice' ? 'voice' : 'text';
    const transcriptionProvider = typeof body.transcription_provider === 'string' && body.transcription_provider.trim() ? body.transcription_provider.trim() : null;
    const transcriptionModel = typeof body.transcription_model === 'string' && body.transcription_model.trim() ? body.transcription_model.trim() : null;

    console.log('[WhatsApp API] Incoming message:', { sessionId, from, message, pushName, whatsappMessageId, inputType, transcriptionProvider, transcriptionModel });
    if (!sessionId) return NextResponse.json({ success: false, reply: null, error: 'Missing session_id' }, { status: 400 });
    if (!from) return NextResponse.json({ success: false, reply: null, error: 'Missing sender' }, { status: 400 });
    if (!message) return NextResponse.json({ success: false, reply: null, error: 'Missing message' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: whatsappSession, error: sessionError } = await supabase.from('whatsapp_sessions').select('id, business_id, integration_id, session_id').eq('session_id', sessionId).maybeSingle();
    if (sessionError) return NextResponse.json({ success: false, reply: null, error: sessionError.message }, { status: 500 });
    if (!whatsappSession) return NextResponse.json({ success: false, reply: null, error: 'WhatsApp session not found' }, { status: 404 });
    const businessId = whatsappSession.business_id;
    if (!businessId) return NextResponse.json({ success: false, reply: null, error: 'WhatsApp session is not connected to a business' }, { status: 500 });

    let voiceReplyMode: 'disabled' | 'text_only' | 'voice_only' | 'text_and_voice' | 'random' = 'text_and_voice';
    let whatsappIntegration: { id?: string; config: unknown } | null = null;
    if (whatsappSession.integration_id) {
      const { data } = await supabase.from('integrations').select('id, config').eq('id', whatsappSession.integration_id).maybeSingle();
      whatsappIntegration = data;
    }
    if (!whatsappIntegration) {
      const { data } = await supabase.from('integrations').select('id, config').eq('business_id', businessId).eq('type', 'whatsapp').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      whatsappIntegration = data;
    }
    const configuredMode = (whatsappIntegration?.config as Record<string, unknown> | null)?.voice_reply_mode;
    if (configuredMode === 'disabled' || configuredMode === 'text_only' || configuredMode === 'voice_only' || configuredMode === 'text_and_voice' || configuredMode === 'random') voiceReplyMode = configuredMode;
    const voiceConfig = (whatsappIntegration?.config as Record<string, unknown> | null) ?? {};
    const voiceCloneFallbackEnabled = typeof voiceConfig.voice_clone_fallback_enabled === 'boolean' ? voiceConfig.voice_clone_fallback_enabled : true;
    const rawVoiceCloneFallbackTimeout = typeof voiceConfig.voice_clone_fallback_timeout_seconds === 'number' ? voiceConfig.voice_clone_fallback_timeout_seconds : 20;
    const voiceCloneFallbackTimeoutSeconds = Math.min(60, Math.max(5, Math.round(rawVoiceCloneFallbackTimeout)));

    const { data: business, error: businessError } = await supabase.from('businesses').select('id, name, industry, description, website, phone, address, timezone, working_hours').eq('id', businessId).maybeSingle();
    if (businessError) return NextResponse.json({ success: false, reply: null, error: businessError.message }, { status: 500 });
    if (!business) return NextResponse.json({ success: false, reply: null, error: 'Business not found' }, { status: 404 });
    const { data: defaultVoiceProfile } = await supabase.from('voice_profiles').select('id').eq('business_id', businessId).eq('is_default', true).eq('status', 'active').maybeSingle();
    const voiceCloneEnabled = !!defaultVoiceProfile?.id;

    if (whatsappMessageId) {
      const { data: duplicateMessage } = await supabase.from('messages').select('id').eq('business_id', businessId).eq('metadata->>whatsapp_message_id', whatsappMessageId).limit(1).maybeSingle();
      if (duplicateMessage) return NextResponse.json({ success: true, reply: null, ignored: true, reason: 'Duplicate message' });
    }

    const isGroup = isWhatsAppGroup(from);
    if (!isGroup) {
      const incomingPhone = resolvePhoneNumber(from, phoneNumberFromBody);
      if (incomingPhone) {
        const { data: matchingLeads } = await supabase.from('leads').select('id').eq('business_id', businessId).or(`phone.eq.${incomingPhone},phone_number.eq.${incomingPhone},customer_phone.eq.${incomingPhone}`).limit(20);
        const leadIds = (matchingLeads || []).map((lead: { id: string }) => lead.id);
        if (leadIds.length) await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('business_id', businessId).eq('status', 'pending').eq('automation_generated', true).in('lead_id', leadIds);
      }
    }

    const { data: agent } = await supabase.from('agents').select('id, business_id, name, purpose, description, communication_style, primary_goal, supported_languages, status, ai_provider, knowledge_source_ids, enabled_capabilities').eq('business_id', businessId).eq('status', 'active').limit(1).maybeSingle();
    let groupRule: any = null;
    if (isGroup) {
      const { data: groupRules } = await supabase.from('group_rules').select('id, business_id, agent_id, group_ai_enabled, response_mode, allowed_category_ids, allowed_product_ids, allow_price_list, allow_quotation, require_product_name, response_language, max_response_length, custom_rules').eq('business_id', businessId).maybeSingle();
      groupRule = groupRules;
      if (!groupRule) return NextResponse.json({ success: true, ignored: true, reply: null, reason: 'No group rule configured' });
      const groupDecision = shouldReplyInGroup(groupRule, message);
      if (!groupDecision.shouldReply) return NextResponse.json({ success: true, ignored: true, reply: null, reason: groupDecision.reason });
    }

    let agentSettings: any = null;
    if (agent) {
      const { data: settings } = await supabase.from('agent_settings').select('id, agent_id, business_id, tone, greeting_behavior, auto_create_leads, appointments_enabled, auto_followups_enabled, max_response_length, response_language, custom_instructions').eq('business_id', businessId).eq('agent_id', agent.id).maybeSingle();
      agentSettings = settings;
    }
    const { data: products } = await supabase.from('products').select('id, business_id, category_id, name, description, price, currency, availability, status').eq('business_id', businessId).eq('status', 'active').limit(100);
    const { data: knowledgeItems } = await supabase.from('knowledge_items').select('id, business_id, title, category, content, tags, metadata, status').eq('business_id', businessId).eq('status', 'active').limit(50);
    const { data: subscriptionPlans } = await supabase.from('subscription_plans').select('name, description, price_cents, yearly_price_cents, currency, billing_period, features, is_active, sort_order').eq('is_active', true).order('sort_order', { ascending: true });

    if (isGroup) {
      const allowedProducts = groupRule?.allowed_product_ids?.length ? (products || []).filter((product) => groupRule.allowed_product_ids.includes(product.id)) : products || [];
      const allowedCategories = groupRule?.allowed_category_ids?.length ? allowedProducts.filter((product) => groupRule.allowed_category_ids.includes(product.category_id)) : allowedProducts;
      const productContext = allowedCategories.length ? allowedCategories.map((product) => `Product: ${product.name}\nDescription: ${product.description || 'Not provided'}\nExact Price: ${product.price != null ? `${product.price} ${product.currency || ''}` : 'Not provided'}`).join('\n\n') : 'No specific products are configured for this group.';
      const { data: providerRows } = await supabase.from('ai_provider_configs').select('provider, api_key_encrypted, base_url, model, priority').eq('is_enabled', true).order('priority', { ascending: true });
      if (!providerRows?.length) return NextResponse.json({ success: true, reply: null, error: 'No enabled AI provider is available' });
      const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({ provider: row.provider, apiKey: row.api_key_encrypted || undefined, apiUrl: row.base_url || undefined, model: row.model, temperature: 0.7, maxTokens: 1024 }));
      const groupSystemPrompt = `You are the WhatsApp group assistant for ${business.name}.\n\nBusiness information:\nBusiness Name: ${business.name}\nIndustry: ${business.industry || 'Not specified'}\nDescription: ${business.description || 'Not specified'}\n\nIMPORTANT GROUP RULES:\n- You are responding inside a WhatsApp group.\n- Only answer according to the configured group rules.\n- Do not respond to unrelated messages.\n- Keep replies concise.\n- Do not mention AgentHub, APIs, providers, databases or internal systems.\n\nResponse Mode:\n${groupRule?.response_mode || 'restricted'}\nRequire Product Name: ${groupRule?.require_product_name ? 'YES' : 'NO'}\nAllow Price List: ${groupRule?.allow_price_list ? 'YES' : 'NO'}\nAllow Quotation: ${groupRule?.allow_quotation ? 'YES' : 'NO'}\nAllowed Products:\n${productContext}\nCustom Group Rules:\n${JSON.stringify(groupRule?.custom_rules || [])}\n\nLANGUAGE: ${buildLanguageInstruction(message)}`;
      const aiResponse = await generateAIResponseWithFallback({ messages: [{ role: 'user', content: message }], systemPrompt: groupSystemPrompt, temperature: 0.7, maxTokens: 1024, businessId }, providerConfigs);
      if (aiResponse.error || !aiResponse.content?.trim()) return NextResponse.json({ success: true, reply: null, error: aiResponse.error });
      return NextResponse.json({ success: true, reply: limitText(aiResponse.content.trim(), groupRule?.max_response_length), provider: aiResponse.provider, model: aiResponse.model, detected_language: detectReplyLanguage(message) });
    }

    const phone = resolvePhoneNumber(from, phoneNumberFromBody);
    let customer: any = null;
    const { data: existingCustomer } = await supabase.from('customers').select('id, business_id, name, phone, email, external_id, metadata').eq('business_id', businessId).eq('external_id', from).maybeSingle();
    customer = existingCustomer;
    if (!customer) {
      const { data: newCustomer, error: customerCreateError } = await supabase.from('customers').insert({ business_id: businessId, name: pushName || phone || 'WhatsApp Customer', phone: phone || null, external_id: from, metadata: { source: 'whatsapp', whatsapp_id: from, session_id: sessionId, push_name: pushName } }).select().single();
      if (customerCreateError) return NextResponse.json({ success: false, reply: null, error: customerCreateError.message }, { status: 500 });
      customer = newCustomer;
    } else {
      const customerUpdates: Record<string, unknown> = {};
      if (!customer.phone && phone) customerUpdates.phone = phone;
      const hasPlaceholderName = !customer.name || customer.name === 'WhatsApp Customer' || customer.name === customer.phone;
      if (pushName && hasPlaceholderName) customerUpdates.name = pushName;
      if (Object.keys(customerUpdates).length) {
        const { data: updatedCustomer } = await supabase.from('customers').update(customerUpdates).eq('id', customer.id).select().single();
        if (updatedCustomer) customer = updatedCustomer;
      }
    }

    let conversation: any = null;
    const { data: existingConversation } = await supabase.from('conversations').select('id, business_id, agent_id, customer_id, type, title, external_id, channel, ai_enabled, status, human_takeover, human_takeover_at, human_takeover_by, ai_resume_at').eq('business_id', businessId).eq('external_id', from).eq('channel', 'whatsapp').maybeSingle();
    conversation = existingConversation;
    if (!conversation) {
      const { data: newConversation, error: conversationCreateError } = await supabase.from('conversations').insert({ business_id: businessId, agent_id: agent?.id || null, customer_id: customer.id, type: 'private', title: customer.name || phone || 'WhatsApp Customer', external_id: from, channel: 'whatsapp', ai_enabled: true, status: 'active', human_takeover: false, last_message_at: new Date().toISOString() }).select().single();
      if (conversationCreateError) return NextResponse.json({ success: false, reply: null, error: conversationCreateError.message }, { status: 500 });
      conversation = newConversation;
    } else {
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
    }

    const { error: incomingMessageError } = await supabase.from('messages').insert({ business_id: businessId, conversation_id: conversation.id, sender_type: 'customer', sender_id: customer.id, content: message, content_type: 'text', is_inbound: true, metadata: { channel: 'whatsapp', whatsapp_id: from, whatsapp_message_id: whatsappMessageId, session_id: sessionId, input_type: inputType, ...(inputType === 'voice' ? { transcription_provider: transcriptionProvider, transcription_model: transcriptionModel } : {}) } });
    if (incomingMessageError) console.error('[WhatsApp API] Incoming message save error:', incomingMessageError);

    if (conversation.human_takeover === true) {
      console.log('[WhatsApp API] Human takeover active; saved customer message and skipped AI:', conversation.id);
      return NextResponse.json({ success: true, reply: null, ignored: true, human_takeover: true, reason: 'Human takeover active', conversation_id: conversation.id, customer_id: customer.id });
    }

    const HISTORY_LIMIT = 16;
    const { data: historyRows } = await supabase.from('messages').select('sender_type, content, created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
    const conversationHistory = (historyRows || []).reverse().filter((row) => row.content && row.content.trim()).map((row) => ({ role: (row.sender_type === 'agent' || row.sender_type === 'business' ? 'assistant' : 'user') as 'user' | 'assistant', content: row.content }));
    if (!conversationHistory.length) conversationHistory.push({ role: 'user', content: message });

    let lead: any = null;
    if (agentSettings?.auto_create_leads === true) {
      const { data: existingLead } = await supabase.from('leads').select('id, business_id, customer_id, conversation_id, status').eq('business_id', businessId).eq('customer_id', customer.id).eq('conversation_id', conversation.id).maybeSingle();
      lead = existingLead;
      if (!lead) {
        const { data: newLead } = await supabase.from('leads').insert({ business_id: businessId, customer_id: customer.id, conversation_id: conversation.id, name: customer.name || phone || 'WhatsApp Customer', phone: customer.phone || phone || null, email: customer.email || null, source: 'whatsapp', requirement: message, status: 'new' }).select().single();
        lead = newLead;
      }
    }
    if (lead && agentSettings?.auto_followups_enabled === true && conversation.human_takeover !== true) {
      const followUpAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: existingAutoFollowUp } = await supabase.from('follow_up_tasks').select('id').eq('business_id', businessId).eq('lead_id', lead.id).eq('status', 'pending').eq('notes', 'auto:lead-checkin').maybeSingle();
      if (existingAutoFollowUp) await supabase.from('follow_up_tasks').update({ scheduled_at: followUpAt }).eq('id', existingAutoFollowUp.id);
      else await supabase.from('follow_up_tasks').insert({ business_id: businessId, lead_id: lead.id, task_type: 'message', scheduled_at: followUpAt, status: 'pending', notes: 'auto:lead-checkin' });
    }

    const { data: providerRows, error: providerError } = await supabase.from('ai_provider_configs').select('id, provider, api_key_encrypted, base_url, model, priority, is_enabled, is_primary, display_name').eq('is_enabled', true).order('priority', { ascending: true });
    if (providerError) return NextResponse.json({ success: false, reply: 'Sorry, I am temporarily unavailable. Please try again shortly.', error: providerError.message }, { status: 500 });
    if (!providerRows?.length) return NextResponse.json({ success: false, reply: 'Sorry, I am temporarily unavailable. Please try again shortly.', error: 'No AI providers are enabled' }, { status: 503 });
    const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({ provider: row.provider, apiKey: row.api_key_encrypted || undefined, apiUrl: row.base_url || undefined, model: row.model, temperature: 0.7, maxTokens: 1024 }));

    const knowledgeContext = knowledgeItems?.length ? knowledgeItems.map((item) => `Title: ${item.title}\nCategory: ${item.category}\nContent: ${item.content}\nTags: ${(item.tags || []).join(', ')}`).join('\n\n---\n\n') : 'No additional business knowledge has been added yet.';
    const productsContext = products?.length ? products.map((product) => `Product: ${product.name}\nDescription: ${product.description || 'No description provided'}\nExact Price: ${product.price != null ? `${product.price} ${product.currency || ''}` : 'Not provided'}\nAvailability: ${product.availability || 'Not provided'}`).join('\n\n') : 'No products have been added yet.';
    const subscriptionPlansContext = subscriptionPlans?.length ? subscriptionPlans.map((plan) => { const currentPrice = typeof plan.price_cents === 'number' ? `${(plan.price_cents / 100).toFixed(2)} ${plan.currency || ''}` : 'Not provided'; const yearlyPrice = typeof plan.yearly_price_cents === 'number' ? `${(plan.yearly_price_cents / 100).toFixed(2)} ${plan.currency || ''}` : 'Not provided'; const features = Array.isArray(plan.features) && plan.features.length ? plan.features.join(', ') : 'No feature list provided'; return `Plan: ${plan.name}\nDescription: ${plan.description || 'Not provided'}\nExact ${plan.billing_period || 'monthly'} Price: ${currentPrice}\nExact Yearly Price: ${yearlyPrice}\nFeatures: ${features}`; }).join('\n\n---\n\n') : 'No subscription plans are available.';

    const intent = analyzeCustomerIntent(message);
    const detectedMemoryLanguage = detectReplyLanguage(message);
    const customerMemory = buildCustomerMemory(customer?.metadata, detectedMemoryLanguage, intent, message);
    await supabase.from('customers').update({ metadata: customerMemory }).eq('id', customer.id);
    customer.metadata = customerMemory;
    // Keep the CRM pipeline live even when the AI is still formulating its reply.
    if (lead) {
      const nextStatus = intent.conversion ? 'won'
        : intent.buying ? 'qualified'
        : intent.hesitation ? 'contacted'
        : lead.status || 'new';
      if (nextStatus !== lead.status) {
        const updates: Record<string, unknown> = { status: nextStatus };
        if (intent.buying && nextStatus !== 'won') updates.interested_product = lead.interested_product || null;
        if (nextStatus === 'won') {
          updates.converted_at = new Date().toISOString();
          updates.conversion_notes = 'Automatically marked from high-intent customer message; review conversion amount in dashboard.';
        }
        await supabase.from('leads').update(updates).eq('id', lead.id);
        lead.status = nextStatus;
        if (nextStatus === 'won') await createBusinessNotifications(supabase, businessId, 'conversion', 'Lead converted', (lead.name || customer.name || 'A customer') + ' reached a conversion-ready stage.', { lead_id: lead.id, conversation_id: conversation.id });
      }
    }
    if (intent.human || intent.complaint) {
      await createBusinessNotifications(supabase, businessId, intent.complaint ? 'complaint' : 'human_takeover', intent.complaint ? 'Customer complaint requires attention' : 'Customer requested a human', message.slice(0, 500), { conversation_id: conversation.id, customer_id: customer.id, lead_id: lead?.id || null });
      // Pause AI for this conversation; the existing dashboard resume flow can
      // reactivate it after the human has handled the case.
      await supabase.from('conversations').update({
        human_takeover: true,
        ai_enabled: false,
        human_takeover_at: new Date().toISOString(),
      }).eq('id', conversation.id);
      return NextResponse.json({
        success: true, reply: null, ignored: true, human_takeover: true,
        reason: intent.complaint ? 'Complaint escalated to human' : 'Customer requested human assistance',
        conversation_id: conversation.id, customer_id: customer.id
      });
    }

    const customerLanguage = detectReplyLanguage(message);
    const languageInstruction = buildLanguageInstruction(message);
    console.log('[WhatsApp API] Detected customer language:', customerLanguage);
    const systemPrompt = `You are the official WhatsApp assistant for ${business.name}.\n\nYou represent THIS business only.\n\nBUSINESS INFORMATION:\nBusiness Name: ${business.name}\nIndustry: ${business.industry || 'Not specified'}\nBusiness Description: ${business.description || 'Not specified'}\nWebsite: ${business.website || 'Not provided'}\nBusiness Phone: ${business.phone || 'Not provided'}\nBusiness Address: ${business.address || 'Not provided'}\n\nAGENT INFORMATION:\nAgent Name: ${agent?.name || `${business.name} Assistant`}\nAgent Purpose: ${agent?.purpose || 'Help customers and answer business questions'}\nAgent Description: ${agent?.description || 'Not provided'}\nCommunication Style: ${agent?.communication_style || 'Professional'}\nPrimary Goal: ${agent?.primary_goal || 'Help customers effectively'}\n\nAGENT SETTINGS:\nTone: ${agentSettings?.tone || 'professional'}\nResponse Language Setting: ${agentSettings?.response_language || 'English'}\nGreeting Behavior: ${agentSettings?.greeting_behavior || 'Natural'}\nCustom Instructions: ${agentSettings?.custom_instructions || 'None'}\n\nBUSINESS PRODUCTS:\n${productsContext}\n\nBUSINESS KNOWLEDGE:\n${knowledgeContext}\n\nLIVE SUBSCRIPTION PLANS AND PRICING:\n${subscriptionPlansContext}\n\nLANGUAGE OVERRIDE FOR THIS MESSAGE — HIGHEST PRIORITY:\n${languageInstruction}\nDetected customer language: ${customerLanguage}\nThe customer's current language overrides the dashboard/default response language. If the customer uses Roman Urdu, every normal customer-facing sentence must use Latin/English letters; do not answer in Urdu Arabic script. If the customer uses English, answer in English. If the customer uses Urdu script, answer in Urdu script. If mixed, naturally preserve the mix. Do not translate the customer's Roman Urdu into English-only.\n\nIMPORTANT RULES:\n- Represent ${business.name}, not AgentHub AI.\n- Never introduce yourself as AgentHub AI.\n- Never mention internal systems, APIs, AI providers, Gemini, Groq, Ollama, or databases.\n- Only use products, knowledge, prices and policies belonging to ${business.name}.\n- Never invent missing information or prices.\n- If an exact price is available, state it directly.\n- Be helpful, professional and natural.\n- Keep replies suitable for WhatsApp and avoid unnecessary long explanations.\n- Match the customer's language and conversational style.\n- Never claim an action was completed unless it actually happened.\n- Do not restart an existing conversation with a generic greeting.\n\nConversation behavior:\n- Match the customer's energy and pace.\n- Never repeat information already given unless asked.\n- SALES INTELLIGENCE: For genuine prospects, actively but respectfully explain relevant benefits, ROI and solutions. Do not give up after a mild objection; address the objection once with useful value, then respect a clear refusal.
- If the customer expresses a price/budget objection, explain the most relevant benefit or alternative based only on available business information.
- LEAD CAPTURE: When useful, naturally ask for missing contact or requirement details. Do not repeatedly ask for information already known.
- FOLLOW-UP: If the customer explicitly says they will decide later or names a future time, keep the conversation open and allow follow-up automation to re-engage them.
- ESCALATION: If the customer asks for a human or makes a serious complaint, AI escalation may take over; do not argue or pressure them.\n- Stay in character as one consistent assistant.\n- Use the recent message history to understand short replies and references.\n`.trim();

    const aiResponse = await generateAIResponseWithFallback({ messages: conversationHistory, systemPrompt, temperature: 0.7, maxTokens: 1024, businessId }, providerConfigs);
    if (aiResponse.error || !aiResponse.content?.trim()) return NextResponse.json({ success: false, reply: 'Sorry, I am temporarily unable to process your message. Please try again in a moment.', error: aiResponse.error || 'AI returned an empty response' }, { status: 503 });

    let finalReply = aiResponse.content.trim();

    // Roman Urdu must never silently fall back to English-only. Use a strict
    // formatting pass with examples, then validate the result and retry once
    // if it still looks English-only.
    if (customerLanguage === 'roman_urdu') {
      const formatRomanUrdu = async (replyToFormat: string, strictRetry = false) => {
        const prompt = strictRetry
          ? `FINAL LANGUAGE CORRECTION REQUIRED. The text below is still English. Convert every normal sentence into natural Pakistani Roman Urdu NOW. Keep names, product names, prices, numbers and abbreviations unchanged. Roman Urdu uses Latin letters, not Urdu script. Example: "Sure! Here's a quick overview of our services." -> "Ji zaroor! Main aap ko hamari services ka mukhtasar overview bata deta hoon." Return only the corrected Roman Urdu customer reply.\\n\\nText: ${replyToFormat}`
          : `Rewrite the following customer reply into natural Pakistani Roman Urdu. Keep the exact meaning, facts, prices, names and numbers. Use Latin letters for Urdu sentences. Do not use Urdu/Arabic script. Do not add information. Example: "We offer fast support and easy setup." -> "Hum fast support aur asaan setup provide karte hain." Return only the Roman Urdu customer reply.\\n\\nReply: ${replyToFormat}`;

        return generateAIResponseWithFallback({
          messages: [{ role: 'user', content: prompt }],
          systemPrompt: 'STRICT OUTPUT FORMATTER: Roman Urdu only. English-only sentences are invalid output.',
          temperature: 0.1,
          maxTokens: 1024,
          businessId
        }, providerConfigs);
      };

      const romanMarkers = /\\b(aap|ap|mujhe|mujhy|ham|hum|hai|hain|ho|hain|ka|ki|ke|ko|se|mein|main|aur|bata|bta|chahiye|kar|karo|karein|karain|ji|zaroor|bilkul|yeh|ye|woh|wo|sari|sab|tamam)\\b/i;
      const englishSignals = /\\b(the|here|sure|quick|friendly|overview|of|our|we|offer|and|with|you|your|this|that|services|service|available)\\b/gi;
      const looksEnglishOnly = (value: string) => {
        const englishCount = (value.match(englishSignals) || []).length;
        return !romanMarkers.test(value) && englishCount >= 2;
      };

      const romanRewrite = await formatRomanUrdu(finalReply);
      if (!romanRewrite.error && romanRewrite.content?.trim()) {
        finalReply = romanRewrite.content.trim();
      }

      if (looksEnglishOnly(finalReply)) {
        const retry = await formatRomanUrdu(finalReply, true);
        if (!retry.error && retry.content?.trim()) {
          finalReply = retry.content.trim();
        }
      }

      console.log('[WhatsApp API] Roman Urdu output enforcement:', {
        detected: customerLanguage,
        stillLooksEnglishOnly: looksEnglishOnly(finalReply)
      });
    }

    // Resolve Random at the source once per reply. Railway receives the final
    // delivery decision instead of depending on another layer to interpret it.
    // This is independent on every reply: voice can repeat, text can repeat,
    // and there is no alternating sequence.
    const resolvedVoiceReplyMode =
      voiceReplyMode === 'random'
        ? (Math.random() < 0.5 ? 'text_only' : 'voice_only')
        : voiceReplyMode;

    console.log('[WhatsApp API] Voice delivery mode:', {
      configured: voiceReplyMode,
      resolved: resolvedVoiceReplyMode,
      random: voiceReplyMode === 'random'
    });

    const normalizedCustomerMessage = String(message || '').toLowerCase();
    const asksAboutVoiceFeature = /\b(voice|audio|voice note|voice reply|voice message|text and voice|text voice)\b/i.test(normalizedCustomerMessage) && /\b(support|available|feature|reply|replies|message|messages|kar|karta|hota|hai|hain|can|does|do)\b/i.test(normalizedCustomerMessage);
    const replyDeniesVoiceFeature = /\b(not available|unavailable|don't have|do not have|doesn't have|not support|doesn't support|cannot support|no voice|feature.*not)\b/i.test(finalReply);
    if (asksAboutVoiceFeature && replyDeniesVoiceFeature) finalReply = customerLanguage === 'roman_urdu' || customerLanguage === 'mixed' ? 'Ji haan, AgentHub WhatsApp AI mein voice replies available hain. Dashboard se aap Text only, Voice only, Text and Voice, ya Random reply mode select kar sakte hain.' : customerLanguage === 'urdu' ? 'جی ہاں، AgentHub WhatsApp AI میں وائس ریپلائز دستیاب ہیں۔ ڈیش بورڈ سے آپ Text only، Voice only، Text and Voice، یا Random reply mode منتخب کر سکتے ہیں۔' : 'Yes, AgentHub WhatsApp AI supports voice replies. From the dashboard you can choose Text only, Voice only, Text and Voice, or Random reply mode.';

    const { data: latestConversation } = await supabase.from('conversations').select('human_takeover, ai_enabled').eq('id', conversation.id).maybeSingle();
    if (latestConversation?.human_takeover === true || latestConversation?.ai_enabled === false) {
      console.log('[WhatsApp API] Human takeover/AI disabled during generation; suppressing AI reply:', conversation.id);
      return NextResponse.json({ success: true, reply: null, ignored: true, human_takeover: latestConversation?.human_takeover === true, reason: 'Human takeover active during AI generation', conversation_id: conversation.id });
    }

    let voiceReply: string | null = null;
    if (resolvedVoiceReplyMode !== 'disabled' && resolvedVoiceReplyMode !== 'text_only') {
      if (detectReplyLanguage(finalReply) === 'urdu') voiceReply = finalReply;
      else if (customerLanguage === 'roman_urdu' || customerLanguage === 'mixed') {
        const voicePrompt = `Convert this customer-facing reply into natural spoken Urdu for voice playback. Preserve meaning exactly. Do not add information. Return only Urdu script.\n\n${finalReply}`;
        const voiceResponse = await generateAIResponseWithFallback({ messages: [{ role: 'user', content: voicePrompt }], systemPrompt: 'Return only natural Urdu script suitable for spoken voice. Do not explain.', temperature: 0.2, maxTokens: 1024, businessId }, providerConfigs);
        if (!voiceResponse.error && voiceResponse.content?.trim()) voiceReply = voiceResponse.content.trim();
      } else voiceReply = finalReply;
    }

    // Post-response pipeline intelligence: keep lead state and follow-up timing
    // aligned with the latest customer intent.
    if (lead && intent.buying && lead.status !== 'won') {
      await createBusinessNotifications(supabase, businessId, 'hot_lead', 'Hot lead detected', (customer.name || lead.name || 'Customer') + ' is showing strong purchase intent.', { lead_id: lead.id, conversation_id: conversation.id, customer_id: customer.id });
    }
    if (lead) {
      const followUpRequestedAt = intent.followup ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
      if (followUpRequestedAt && agentSettings?.auto_followups_enabled === true) {
        await supabase.from('follow_up_tasks').update({ scheduled_at: followUpRequestedAt })
          .eq('business_id', businessId).eq('lead_id', lead.id).eq('status', 'pending').eq('automation_generated', true);
      }
      console.log('[WhatsApp API] Pipeline intelligence', {
        leadId: lead.id, status: lead.status, buying: intent.buying,
        conversion: intent.conversion, followup: intent.followup, lowConfidence: intent.lowConfidence
      });
    }

    const { error: aiMessageError } = await supabase.from('messages').insert({ business_id: businessId, conversation_id: conversation.id, sender_type: 'agent', content: finalReply, content_type: 'text', is_inbound: false, metadata: { channel: 'whatsapp', provider: aiResponse.provider, model: aiResponse.model, detected_language: customerLanguage, voice_reply_mode: resolvedVoiceReplyMode, configured_voice_reply_mode: voiceReplyMode } });
    if (aiMessageError) console.error('[WhatsApp API] AI message save error:', aiMessageError);
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);

    let bookedAppointmentId: string | null = null;
    if (agentSettings?.appointments_enabled === true) {
      const detected = await detectAppointmentRequest(message, finalReply, business.address || '', providerConfigs);
      if (detected) {
        const { data: newAppointment } = await supabase.from('appointments').insert({ business_id: businessId, customer_id: customer.id, lead_id: lead?.id || null, customer_name: customer.name || phone || 'WhatsApp Customer', date: detected.date, start_time: detected.startTime, end_time: detected.endTime, status: 'scheduled', notes: detected.notes }).select().single();
        if (newAppointment) {
          bookedAppointmentId = newAppointment.id;
          if (lead) await supabase.from('leads').update({ status: 'appointment_booked' }).eq('id', lead.id);
          if (lead) await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('business_id', businessId).eq('lead_id', lead.id).eq('status', 'pending').eq('notes', 'auto:lead-checkin');
          const appointmentDateTime = new Date(`${detected.date}T${detected.startTime}:00`);
          const reminderAt = new Date(appointmentDateTime.getTime() - 60 * 60 * 1000);
          if (reminderAt.getTime() > Date.now()) await supabase.from('follow_up_tasks').insert({ business_id: businessId, lead_id: lead?.id || null, appointment_id: newAppointment.id, task_type: 'meeting', scheduled_at: reminderAt.toISOString(), status: 'pending', notes: 'auto:appointment-reminder' });
        }
      }
    }

    return NextResponse.json({ success: true, reply: finalReply, voice_reply: voiceReply, voice_reply_mode: resolvedVoiceReplyMode, configured_voice_reply_mode: voiceReplyMode, voice_clone_enabled: voiceCloneEnabled, voice_clone_fallback_enabled: voiceCloneFallbackEnabled, voice_clone_fallback_timeout_seconds: voiceCloneFallbackTimeoutSeconds, voice_profile_id: defaultVoiceProfile?.id || null, provider: aiResponse.provider, model: aiResponse.model, appointment_id: bookedAppointmentId, detected_language: customerLanguage, business: { id: business.id, name: business.name }, customer_id: customer.id, conversation_id: conversation.id, lead_id: lead?.id || null });
  } catch (error) {
    console.error('[WhatsApp API] Unexpected error:', error);
    return NextResponse.json({ success: false, reply: 'Sorry, something went wrong while processing your message.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
