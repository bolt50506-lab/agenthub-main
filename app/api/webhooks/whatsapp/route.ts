import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { shouldReplyInGroup } from '@/lib/group-rules';
import {
  generateAIResponseWithFallback,
  type ProviderConfig,
} from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const supabase = createServiceClient();
  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .maybeSingle();

  const verifyToken = (integration?.config as Record<string, unknown>)?.verify_token as string | undefined;

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: CORS });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403, headers: CORS });
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const stage = (name: string, startedAt: number) => console.log(`[WhatsApp AI Timing] ${name}: ${Date.now() - startedAt}ms`);
  const body = await req.json() as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messaging_product?: string;
          metadata?: { phone_number_id?: string };
          messages?: Array<{
            from?: string;
            id?: string;
            text?: { body?: string };
            type?: string;
          }>;
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        };
      }>;
    }>;
  };

  const supabase = createServiceClient();
  const databaseStartedAt = Date.now();

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  const contact = value?.contacts?.[0];

  if (!message || !value?.metadata?.phone_number_id) {
    return NextResponse.json({ status: 'no_message' }, { headers: CORS });
  }

  const phoneNumberId = value.metadata.phone_number_id;
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, business_id, config')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .maybeSingle();

  if (!integration || !integration.business_id) {
    return NextResponse.json({ status: 'no_integration' }, { headers: CORS });
  }

  const config = integration.config as Record<string, unknown>;
  if (config.phone_number_id !== phoneNumberId) {
    return NextResponse.json({ status: 'phone_mismatch' }, { headers: CORS });
  }

  const businessId = integration.business_id;
  const senderPhone = message.from ?? '';
  const senderName = contact?.profile?.name ?? null;
  const textBody = message.text?.body ?? '';

  /*
  |--------------------------------------------------------------------------
  | Group detection
  |--------------------------------------------------------------------------
  |
  | IMPORTANT: the official Meta WhatsApp Business Cloud API does not
  | deliver group messages to a business webhook the way a personal
  | WhatsApp account (Baileys/QR) does - a Cloud API business number
  | cannot passively receive automated group traffic via this endpoint.
  | The previous implementation checked whether the message TEXT
  | contained the literal substring "__group__", which is not a real
  | signal WhatsApp ever sends and would never match a genuine message,
  | so this branch was permanently dead code that always treated every
  | message as private.
  |
  | This now checks the sender id for the actual WhatsApp group JID
  | suffix (@g.us), which is what any BSP/gateway that DOES forward
  | group traffic would use. For a standard Meta Cloud API webhook this
  | will still normally be false, and that's expected/correct - it is
  | not a bug, it's a platform limitation. If you need automated group
  | replies, that requires the QR/Baileys channel.
  |
  */

  const isGroup = senderPhone.endsWith('@g.us');

  /*
  |--------------------------------------------------------------------------
  | Duplicate message protection
  |--------------------------------------------------------------------------
  |
  | Meta can redeliver the same webhook event on retry. Use the
  | WhatsApp message id to make sure we never store/reply to the same
  | message twice.
  |
  */

  const whatsappMessageId = message.id ?? null;

  if (whatsappMessageId) {
    const { data: duplicateMessage } = await supabase
      .from('messages')
      .select('id')
      .eq('business_id', businessId)
      .eq('metadata->>whatsapp_message_id', whatsappMessageId)
      .limit(1)
      .maybeSingle();

    if (duplicateMessage) {
      return NextResponse.json({ status: 'duplicate_ignored' }, { headers: CORS });
    }
  }

  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', senderPhone)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({ business_id: businessId, name: senderName ?? senderPhone, phone: senderPhone, metadata: { source: 'whatsapp' } })
      .select()
      .maybeSingle();
    customerId = newCustomer?.id ?? null;
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .maybeSingle();

  let conversationId: string | null = null;
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        agent_id: agent?.id ?? null,
        type: isGroup ? 'group' : 'private',
        channel: 'whatsapp',
        status: 'active',
        ai_enabled: true,
      })
      .select()
      .maybeSingle();
    conversationId = newConv?.id ?? null;
  }

  if (!conversationId) {
    return NextResponse.json({ status: 'no_conversation' }, { headers: CORS });
  }

  stage('customer_and_conversation_setup', databaseStartedAt);

  await supabase.from('messages').insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: 'customer',
    content: textBody,
    content_type: 'text',
    is_inbound: true,
    metadata: {
      channel: 'whatsapp_cloud_api',
      whatsapp_message_id: whatsappMessageId,
    },
  });

  let shouldReply = true;
  let replyReason = 'Default reply';

  if (isGroup) {
    const { data: groupRules } = await supabase
      .from('group_rules')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    if (groupRules) {
      const result = shouldReplyInGroup(groupRules, textBody);
      shouldReply = result.shouldReply;
      replyReason = result.reason;
    } else {
      shouldReply = false;
      replyReason = 'No group rules configured';
    }
  }

  if (!shouldReply) {
    return NextResponse.json({ status: 'ignored', reason: replyReason }, { headers: CORS });
  }

  let reply = '';
  const { data: conv } = await supabase
    .from('conversations')
    .select('agent_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (conv?.agent_id) {
    const { data: agentData } = await supabase
      .from('agents')
      .select('name, purpose, communication_style, primary_goal')
      .eq('id', conv.agent_id)
      .maybeSingle();

    if (agentData) {
      const { data: settings } = await supabase
        .from('agent_settings')
        .select('tone, custom_instructions, response_language, max_response_length')
        .eq('agent_id', conv.agent_id)
        .maybeSingle();

      const { data: providerRows } = await supabase
        .from('ai_provider_configs')
        .select('provider, model, base_url, is_enabled, api_key_encrypted, priority')
        .eq('business_id', businessId)
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      if (providerRows && providerRows.length > 0) {
        const contextStartedAt = Date.now();
        const [prevMessagesResult, knowledgeItemsResult, productsResult] = await Promise.all([
          supabase
            .from('messages')
            .select('sender_type, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(4),
          supabase
            .from('knowledge_items')
            .select('title, content, category')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('products')
            .select('name, description, price, currency, availability, sku')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5),
        ]);
        const prevMessages = prevMessagesResult.data;
        const knowledgeItems = knowledgeItemsResult.data;
        const products = productsResult.data;
        stage('context_queries_parallel', contextStartedAt);

        /* OLD SERIAL QUERIES REMOVED
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('sender_type, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(6);

        // Load knowledge items for business context
        const { data: knowledgeItems } = await supabase
          .from('knowledge_items')
          .select('title, content, category')
          .eq('business_id', businessId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(8);

        // Load products for business context
        const { data: products } = await supabase
          .from('products')
          .select('name, description, price, currency, availability, sku')
          .eq('business_id', businessId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(8);
        */

        let systemPrompt = `You are ${agentData.name}. Purpose: ${agentData.purpose}. Style: ${agentData.communication_style || 'professional'}. Goal: ${agentData.primary_goal || 'help customers'}. Give concise, direct replies suitable for instant messaging. Do not over-explain unless the customer asks for detail.`;

        if (knowledgeItems && knowledgeItems.length > 0) {
          const knowledgeText = knowledgeItems
            .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
            .join('\n');
          systemPrompt += `\n\nKnowledge Base:\n${knowledgeText}`;
        }

        if (products && products.length > 0) {
          const productText = products
            .map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ''}${p.price != null ? ` (Price: ${p.price} ${p.currency})` : ''}${p.availability ? ` [${p.availability}]` : ''}`)
            .join('\n');
          systemPrompt += `\n\nProducts/Services:\n${productText}`;
        }

        if (settings?.custom_instructions) {
          systemPrompt += ` ${settings.custom_instructions}`;
        }
        if (settings?.response_language) {
          systemPrompt += ` Respond in ${settings.response_language}.`;
        }

        // Add group rules context if this is a group message
        if (isGroup) {
          const { data: groupRules } = await supabase
            .from('group_rules')
            .select('*')
            .eq('business_id', businessId)
            .maybeSingle();

          if (groupRules?.custom_rules && Array.isArray(groupRules.custom_rules) && groupRules.custom_rules.length > 0) {
            const rulesText = groupRules.custom_rules
              .map((r: { condition: string; action: string }) => `If ${r.condition}, then ${r.action}`)
              .join('; ');
            systemPrompt += `\n\nGroup Rules: ${rulesText}`;
          }
          if (groupRules?.max_response_length) {
            systemPrompt += ` Keep responses under ${groupRules.max_response_length} characters.`;
          }
        }

        const aiMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...(prevMessages ?? []).map((m) => ({
            role: m.sender_type === 'customer' ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
        ];

        try {
          const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({
            provider: row.provider,
            apiKey: row.api_key_encrypted || undefined,
            apiUrl: row.base_url || undefined,
            model: row.model,
            temperature: 0.7,
            maxTokens: Math.min(settings?.max_response_length ?? 512, 180),
          }));

          const aiStartedAt = Date.now();
          const response = await generateAIResponseWithFallback(
            {
              messages: aiMessages,
              temperature: 0.7,
              maxTokens: Math.min(settings?.max_response_length ?? 512, 180),
            },
            providerConfigs
          );
          stage('ai_generation_total', aiStartedAt);
          reply = response.content || '';
          if (response.error) reply = '';
        } catch {
          reply = '';
        }
      } else {
        // No AI provider configured — return clear error message
        reply = 'No AI provider has been configured for this business. Please configure an AI provider in the admin panel.';
      }
    }
  }

  if (!reply) {
    reply = 'Thank you for your message. Our team will get back to you shortly.';
  }

  // Avoid sending error messages about missing AI provider to the customer
  if (reply.startsWith('No AI provider has been configured')) {
    reply = 'Thank you for your message. Our team will get back to you shortly.';
  }

  await supabase.from('messages').insert({
    business_id: businessId,
    conversation_id: conversationId,
    sender_type: 'agent',
    content: reply,
    content_type: 'text',
    is_inbound: false,
  });

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

  const accessToken = config.access_token as string | undefined;
  if (accessToken && config.business_phone) {
    try {
      await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: senderPhone,
          type: 'text',
          text: { body: reply },
        }),
      });
    } catch { /* best effort */ }
  }

  console.log(`[WhatsApp AI Timing] total_request: ${Date.now() - requestStartedAt}ms`);
  return NextResponse.json({ status: 'replied', reply }, { headers: CORS });
}
