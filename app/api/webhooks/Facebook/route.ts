import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildLeadConversionDirective } from '@/lib/ai/lead-conversion';
import { extractMetaAttachmentText, type MetaAttachment } from '@/lib/meta/incoming-media';
import { generateMetaVoiceUrl } from '@/lib/meta/outgoing-voice';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
type ReplyMode = 'disabled' | 'text_only' | 'voice_only' | 'text_and_voice' | 'random';

export async function OPTIONS() { return new Response(null, { status: 200, headers: CORS }); }

export async function GET(req: NextRequest) {
  const url = new URL(req.url); const mode = url.searchParams.get('hub.mode'); const token = url.searchParams.get('hub.verify_token'); const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge) return NextResponse.json({ error: 'Verification failed' }, { status: 403, headers: CORS });
  const supabase = createServiceClient();
  const { data: integrations } = await supabase.from('integrations').select('config').eq('type', 'facebook_messenger').eq('status', 'connected');
  const matched = (integrations || []).some((i) => (i.config as Record<string, unknown> | null)?.verify_token === token);
  return matched ? new NextResponse(challenge, { status: 200, headers: CORS }) : NextResponse.json({ error: 'Verification failed' }, { status: 403, headers: CORS });
}

async function fetchSenderName(psid: string, pageAccessToken: string): Promise<string | null> {
  try { const res = await fetch(`https://graph.facebook.com/v18.0/${psid}?fields=first_name,last_name&access_token=${encodeURIComponent(pageAccessToken)}`); if (!res.ok) return null; const data = await res.json() as { first_name?: string; last_name?: string }; return [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null; } catch { return null; }
}

function resolveReplyMode(configured: unknown, customerText: string): ReplyMode {
  const text = String(customerText || '').toLowerCase();
  const wantsVoice = /\b(voice|audio|voice note|voicenote|speak|bol ke|bolkar|bol kar|awaaz|awaz|voice mein|voice me|audio mein|audio me)\b/.test(text);
  const wantsText = /\b(text|message|likh|likh dein|likh do|type|written|write|chat mein|chat me|message mein|message me)\b/.test(text);
  if (wantsVoice && !wantsText) return 'voice_only';
  if (wantsText && !wantsVoice) return 'text_only';
  const allowed: ReplyMode[] = ['disabled', 'text_only', 'voice_only', 'text_and_voice', 'random'];
  const mode = allowed.includes(configured as ReplyMode) ? configured as ReplyMode : 'text_and_voice';
  if (mode === 'random') return Math.random() < 0.5 ? 'text_only' : 'voice_only';
  return mode;
}

async function sendMessengerReply(psid: string, pageAccessToken: string, text: string, mode: ReplyMode, audioUrl?: string | null) {
  let ok = true;
  if (mode === 'text_only' || mode === 'disabled' || mode === 'text_and_voice' || (!audioUrl && mode === 'voice_only')) {
    const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: psid }, message: { text }, messaging_type: 'RESPONSE' }) });
    ok = res.ok && ok;
    if (!res.ok) console.error('[Messenger] Text send API error:', res.status, (await res.text()).slice(0, 500));
  }
  if (audioUrl && (mode === 'voice_only' || mode === 'text_and_voice')) {
    const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: psid }, message: { attachment: { type: 'audio', payload: { url: audioUrl, is_reusable: false } } }, messaging_type: 'RESPONSE' }) });
    ok = res.ok && ok;
    if (!res.ok) console.error('[Messenger] Audio send API error:', res.status, (await res.text()).slice(0, 500));
  }
  return ok;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { object?: string; entry?: Array<{ id?: string; messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: MetaAttachment[] } }> }> };
  if (body.object !== 'page') return NextResponse.json({ status: 'ignored' }, { headers: CORS });
  const supabase = createServiceClient();
  for (const entry of body.entry || []) {
    const pageId = entry.id;
    for (const event of entry.messaging || []) {
      try {
        if (event.message?.is_echo) continue;
        const psid = event.sender?.id; const textBody = event.message?.text?.trim(); const messageId = event.message?.mid || null; const attachments = event.message?.attachments || [];
        if (!pageId || !psid) continue;
        const { data: integrations } = await supabase.from('integrations').select('id, business_id, config').eq('type', 'facebook_messenger').eq('status', 'connected');
        const integration = (integrations || []).find((row) => (row.config as Record<string, unknown> | null)?.page_id === pageId);
        const config = (integration?.config || {}) as Record<string, unknown>; const businessId = integration?.business_id; const pageAccessToken = config.page_access_token as string | undefined;
        if (!businessId || !pageAccessToken) { console.error('[Messenger] Missing business or page token for page:', pageId); continue; }
        if (messageId) { const { data: duplicate } = await supabase.from('messages').select('id').eq('business_id', businessId).eq('metadata->>messenger_message_id', messageId).limit(1).maybeSingle(); if (duplicate) continue; }

        let inboundText = textBody || ''; let mediaKind: 'image' | 'audio' | null = null;
        if (!inboundText && attachments.length) {
          for (const attachment of attachments) {
            try { const extracted = await extractMetaAttachmentText(attachment, pageAccessToken, businessId); if (extracted?.text) { inboundText = extracted.text; mediaKind = extracted.kind; break; } } catch (mediaError) { console.error('[Messenger] Attachment analysis failed:', mediaError); }
          }
        }
        if (!inboundText) { console.log('[Messenger] Unsupported/empty attachment ignored:', attachments.map((a) => a.type)); continue; }

        const { data: existingCustomer } = await supabase.from('customers').select('id, name, phone, email, external_id').eq('business_id', businessId).eq('external_id', psid).maybeSingle();
        let customer = existingCustomer;
        if (!customer) {
          const senderName = await fetchSenderName(psid, pageAccessToken);
          const { data: newCustomer, error } = await supabase.from('customers').insert({ business_id: businessId, name: senderName || 'Messenger User', external_id: psid, metadata: { source: 'facebook_messenger', psid } }).select().single();
          if (error || !newCustomer) { console.error('[Messenger] Customer creation error:', error); continue; } customer = newCustomer;
        }
        if (!customer) continue;
        const { data: agent } = await supabase.from('agents').select('id, name, purpose, description, communication_style, primary_goal').eq('business_id', businessId).eq('status', 'active').limit(1).maybeSingle();
        const { data: existingConversation } = await supabase.from('conversations').select('id, agent_id').eq('business_id', businessId).eq('external_id', psid).eq('channel', 'facebook_messenger').maybeSingle();
        let conversation = existingConversation;
        if (!conversation) {
          const { data: created, error } = await supabase.from('conversations').insert({ business_id: businessId, agent_id: agent?.id || null, customer_id: customer.id, type: 'private', title: customer.name || 'Messenger User', external_id: psid, channel: 'facebook_messenger', ai_enabled: true, status: 'active', last_message_at: new Date().toISOString() }).select().single();
          if (error || !created) { console.error('[Messenger] Conversation creation error:', error); continue; } conversation = created;
        } else await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
        if (!conversation) continue;

        await supabase.from('messages').insert({ business_id: businessId, conversation_id: conversation.id, sender_type: 'customer', sender_id: customer.id, content: inboundText, content_type: mediaKind || 'text', is_inbound: true, metadata: { channel: 'facebook_messenger', messenger_message_id: messageId, psid, media_kind: mediaKind, attachment_count: attachments.length } });

        const { data: business } = await supabase.from('businesses').select('id, name, industry, description, website, phone, address').eq('id', businessId).maybeSingle();
        const { data: agentSettings } = agent ? await supabase.from('agent_settings').select('tone, response_language, custom_instructions, max_response_length').eq('business_id', businessId).eq('agent_id', agent.id).maybeSingle() : { data: null };
        const { data: knowledgeItems } = await supabase.from('knowledge_items').select('title, category, content, tags').eq('business_id', businessId).eq('status', 'active').limit(50);
        const { data: products } = await supabase.from('products').select('name, description').eq('business_id', businessId).limit(100);
        const { data: providerRows } = await supabase.from('ai_provider_configs').select('provider, model, base_url, api_key_encrypted, priority').eq('is_enabled', true).order('priority', { ascending: true });
        if (!providerRows?.length || !business) continue;
        const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({ provider: row.provider, apiKey: row.api_key_encrypted || undefined, apiUrl: row.base_url || undefined, model: row.model, temperature: 0.7, maxTokens: 1024 }));
        const knowledgeContext = knowledgeItems?.length ? knowledgeItems.map((i) => `Title: ${i.title}\nCategory: ${i.category}\nContent: ${i.content}`).join('\n\n---\n\n') : 'No additional business knowledge has been added yet.';
        const productsContext = products?.length ? products.map((p) => `Product: ${p.name}\nDescription: ${p.description || 'Not provided'}`).join('\n\n') : 'No products have been added yet.';
        const systemPrompt = `You are the official Facebook Messenger assistant for ${business.name}. You represent THIS business only.\n\nBusiness Name: ${business.name}\nIndustry: ${business.industry || 'Not specified'}\nDescription: ${business.description || 'Not specified'}\nAgent: ${agent?.name || `${business.name} Assistant`}\nPurpose: ${agent?.purpose || 'Help customers and answer business questions'}\nTone: ${agentSettings?.tone || 'professional'}\nResponse Language: ${agentSettings?.response_language || 'English'}\nCustom Instructions: ${agentSettings?.custom_instructions || 'None'}\n\nProducts:\n${productsContext}\n\nKnowledge:\n${knowledgeContext}\n\nRules:\n- Never mention AgentHub, APIs, providers, or internal systems.\n- Do not invent products, prices, or policies.\n- Keep replies suitable for Messenger - short and natural.\n- Reply in the customer's language; if they use Roman Urdu, reply in Roman Urdu.\n\nLead conversion mission:\n${buildLeadConversionDirective()}`;
        const aiResponse = await generateAIResponseWithFallback({ messages: [{ role: 'user', content: inboundText }], systemPrompt, temperature: 0.7, maxTokens: agentSettings?.max_response_length ? Math.min(1024, agentSettings.max_response_length) : 1024, businessId }, providerConfigs);
        if (aiResponse.error || !aiResponse.content?.trim()) { console.error('[Messenger] AI generation failed:', aiResponse.error); continue; }
        const finalReply = aiResponse.content.trim();
        const replyMode = resolveReplyMode(config.voice_reply_mode, inboundText);
        let audioUrl: string | null = null;
        if (replyMode === 'voice_only' || replyMode === 'text_and_voice') {
          try {
            const voice = await generateMetaVoiceUrl(businessId, finalReply, agentSettings?.response_language || null);
            audioUrl = voice?.url || null;
          } catch (voiceError) { console.error('[Messenger] Audio generation failed; falling back to text:', voiceError); }
        }
        const effectiveMode: ReplyMode = (replyMode === 'voice_only' && !audioUrl) ? 'text_only' : replyMode;
        await supabase.from('messages').insert({ business_id: businessId, conversation_id: conversation.id, sender_type: 'agent', sender_id: agent?.id || null, content: finalReply, content_type: effectiveMode === 'voice_only' ? 'audio' : 'text', is_inbound: false, metadata: { channel: 'facebook_messenger', provider: aiResponse.provider, model: aiResponse.model, reply_mode: effectiveMode, audio_sent: Boolean(audioUrl && (effectiveMode === 'voice_only' || effectiveMode === 'text_and_voice')) } });
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
        console.log('[Messenger] Reply sent:', await sendMessengerReply(psid, pageAccessToken, finalReply, effectiveMode, audioUrl));
      } catch (error) { console.error('[Messenger] Error processing event:', error); }
    }
  }
  return NextResponse.json({ status: 'ok' }, { headers: CORS });
}
