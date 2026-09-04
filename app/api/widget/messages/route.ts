import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, max-age=0',
};

function isDomainAllowed(refererHost: string, config: Record<string, unknown>): boolean {
  const siteUrl = (config.site_url as string) || '';
  const allowedDomains = (config.allowed_domains as string[]) || [];
  const allowedHosts: string[] = [];
  if (siteUrl) { try { allowedHosts.push(new URL(siteUrl).hostname); } catch {} }
  for (const d of allowedDomains) if (d) allowedHosts.push(d.trim());
  if (allowedHosts.length === 0 || !refererHost) return true;
  return allowedHosts.some((h) => refererHost === h || refererHost.endsWith('.' + h));
}

function normalizeMessage(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const visitorId = req.nextUrl.searchParams.get('visitor_id');
  const after = req.nextUrl.searchParams.get('after');

  if (!businessId || !sessionId || !visitorId) {
    return NextResponse.json({ error: 'Missing session details' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, business_id, customer_id, status')
    .eq('id', sessionId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!conversation || conversation.status !== 'active' || conversation.customer_id !== visitorId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: CORS });
  }

  // NEVER replay conversation history when the widget has no cursor.
  // A polling widget without a cursor must not turn old AI messages into
  // apparently unsolicited replies. Only return messages strictly newer than
  // the cursor supplied by the widget.
  if (!after) {
    return NextResponse.json({ messages: [] }, { headers: CORS });
  }

  const parsed = new Date(after);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ messages: [] }, { headers: CORS });
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_type, content_type')
    .eq('conversation_id', sessionId)
    .eq('business_id', businessId)
    .eq('sender_type', 'agent')
    .gt('created_at', parsed.toISOString())
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: 'Failed to load replies' }, { status: 500, headers: CORS });

  return NextResponse.json({
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      sender: 'agent',
      content_type: m.content_type,
    })),
  }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { business_id, session_id, visitor_id, message } = body as {
    business_id: string;
    session_id: string | null;
    visitor_id: string | null;
    message: string;
  };

  const cleanMessage = message?.trim();
  if (!business_id || !cleanMessage) {
    return NextResponse.json({ error: 'Missing business_id or message' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();
  const referer = req.headers.get('referer') || req.headers.get('origin') || '';
  let refererHost = '';
  try { refererHost = new URL(referer).hostname; } catch {}

  const { data: integration } = await supabase
    .from('integrations')
    .select('status, config')
    .eq('business_id', business_id)
    .eq('type', 'website_chat')
    .maybeSingle();

  if (!integration || integration.status !== 'connected') {
    return NextResponse.json({ error: 'Widget not active' }, { status: 404, headers: CORS });
  }

  const config = (integration.config ?? {}) as Record<string, unknown>;
  if (!isDomainAllowed(refererHost, config)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403, headers: CORS });
  }

  let customerId = visitor_id;
  let conversationId = session_id;

  if (customerId) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('business_id', business_id)
      .maybeSingle();
    if (!existingCustomer) customerId = null;
  }

  if (!customerId) {
    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({ business_id, name: 'Website Visitor', metadata: { source: 'website_widget' } })
      .select('id')
      .maybeSingle();
    if (error || !newCustomer) {
      return NextResponse.json({ error: 'Failed to create visitor' }, { status: 500, headers: CORS });
    }
    customerId = newCustomer.id;
  }

  if (conversationId) {
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, business_id, customer_id')
      .eq('id', conversationId)
      .eq('business_id', business_id)
      .maybeSingle();
    if (!existingConv || existingConv.customer_id !== customerId) conversationId = null;
  }

  if (!conversationId) {
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        business_id,
        customer_id: customerId,
        agent_id: agent?.id ?? null,
        type: 'private',
        channel: 'website_chat',
        status: 'active',
        ai_enabled: true,
      })
      .select('id')
      .maybeSingle();

    if (error || !newConv) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500, headers: CORS });
    }
    conversationId = newConv.id;
  }

  // Re-check state immediately before accepting the customer message.
  // Human takeover always wins over AI.
  let { data: conv } = await supabase
    .from('conversations')
    .select('agent_id, ai_enabled, human_takeover')
    .eq('id', conversationId)
    .eq('business_id', business_id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404, headers: CORS });

  // Browser retries and old widgets can POST the same text more than once.
  // Treat an identical customer message received in the last 15 seconds as
  // the same event. This prevents one click/retry from creating multiple AI
  // generations and multiple replies.
  const duplicateSince = new Date(Date.now() - 15000).toISOString();
  const normalized = normalizeMessage(cleanMessage);
  const { data: recentCustomers } = await supabase
    .from('messages')
    .select('id, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('business_id', business_id)
    .eq('sender_type', 'customer')
    .gte('created_at', duplicateSince)
    .order('created_at', { ascending: false })
    .limit(10);

  const duplicate = (recentCustomers ?? []).find((m) => normalizeMessage(m.content) === normalized);
  if (duplicate) {
    const { data: duplicateReply } = await supabase
      .from('messages')
      .select('id, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('business_id', business_id)
      .eq('sender_type', 'agent')
      .gt('created_at', duplicate.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (duplicateReply) {
      return NextResponse.json({
        session_id: conversationId,
        visitor_id: customerId,
        reply: duplicateReply.content,
        reply_id: duplicateReply.id,
        reply_created_at: duplicateReply.created_at,
        mode: 'ai',
        duplicate: true,
      }, { headers: CORS });
    }

    return NextResponse.json({
      session_id: conversationId,
      visitor_id: customerId,
      reply: '',
      mode: conv.human_takeover ? 'human' : 'processing',
      duplicate: true,
    }, { headers: CORS });
  }

  const { error: incomingInsertError } = await supabase.from('messages').insert({
    business_id,
    conversation_id: conversationId,
    sender_type: 'customer',
    content: cleanMessage,
    content_type: 'text',
    is_inbound: true,
  });

  if (incomingInsertError) {
    console.error('[Widget] Failed to store inbound message:', incomingInsertError.message);
    return NextResponse.json({ error: 'Failed to store message' }, { status: 500, headers: CORS });
  }

  if (conv && !conv.agent_id) {
    const { data: fallbackAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallbackAgent) {
      await supabase
        .from('conversations')
        .update({ agent_id: fallbackAgent.id })
        .eq('id', conversationId)
        .eq('business_id', business_id);
      conv = { ...conv, agent_id: fallbackAgent.id };
    }
  }

  // Check takeover again after persistence. A human reply/takeover must stop
  // AI before generation begins.
  const { data: currentConv } = await supabase
    .from('conversations')
    .select('agent_id, ai_enabled, human_takeover')
    .eq('id', conversationId)
    .eq('business_id', business_id)
    .maybeSingle();

  conv = currentConv ?? conv;

  if (!conv?.ai_enabled || conv.human_takeover) {
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    return NextResponse.json({ session_id: conversationId, visitor_id: customerId, reply: '', mode: 'human' }, { headers: CORS });
  }

  let reply = '';

  if (conv.agent_id) {
    const { data: agent } = await supabase
      .from('agents')
      .select('name, purpose, communication_style, primary_goal, knowledge_source_ids')
      .eq('id', conv.agent_id)
      .maybeSingle();

    if (agent) {
      const { data: settings } = await supabase
        .from('agent_settings')
        .select('tone, custom_instructions, response_language, max_response_length')
        .eq('agent_id', conv.agent_id)
        .maybeSingle();

      const { data: providerRows } = await supabase
        .from('ai_provider_configs')
        .select('provider, model, base_url, is_enabled, api_key_encrypted, priority')
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      if (providerRows?.length) {
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('sender_type, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(12);
        const { data: knowledgeItems } = await supabase
          .from('knowledge_items')
          .select('title, content, category')
          .eq('business_id', business_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(20);
        const { data: subscriptionPlans } = await supabase
          .from('subscription_plans')
          .select('name, description, price_cents, yearly_price_cents, currency, billing_period, features, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        const { data: products } = await supabase
          .from('products')
          .select('name, description, price, currency, availability, sku')
          .eq('business_id', business_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);

        let systemPrompt = `You are ${agent.name}. Purpose: ${agent.purpose}. Style: ${agent.communication_style || 'professional'}. Goal: ${agent.primary_goal || 'help customers'}.`;
        if (knowledgeItems?.length) systemPrompt += `\n\nKnowledge Base:\n${knowledgeItems.map((k) => `[${k.category}] ${k.title}: ${k.content}`).join('\n')}`;
        if (products?.length) systemPrompt += `\n\nProducts/Services:\n${products.map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ''}${p.price != null ? ` (Price: ${p.price} ${p.currency})` : ''}${p.availability ? ` [${p.availability}]` : ''}`).join('\n')}`;
        if (subscriptionPlans?.length) systemPrompt += `\n\nLIVE SUBSCRIPTION PLANS AND PRICING:\n${subscriptionPlans.map((p) => `Plan: ${p.name}\nDescription: ${p.description || 'Not provided'}\nPrice: ${typeof p.price_cents === 'number' ? `${(p.price_cents / 100).toFixed(2)} ${p.currency || ''}` : 'Not provided'}\nYearly Price: ${typeof p.yearly_price_cents === 'number' ? `${(p.yearly_price_cents / 100).toFixed(2)} ${p.currency || ''}` : 'Not provided'}\nFeatures: ${Array.isArray(p.features) ? p.features.join(', ') : 'No feature list provided'}`).join('\n\n')}`;
        systemPrompt += `\n\nPRICING RULES:\n- Use exact prices in Products/Services or LIVE SUBSCRIPTION PLANS when available.\n- Never invent or guess a price.\n- If an exact price is present, state it directly.\n- Only say pricing is unavailable when it genuinely is not present.`;
        if (settings?.custom_instructions) systemPrompt += `\n${settings.custom_instructions}`;
        if (settings?.response_language) systemPrompt += `\nRespond in ${settings.response_language}.`;

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
            maxTokens: settings?.max_response_length ?? 512,
          }));
          const response = await generateAIResponseWithFallback({
            messages: aiMessages,
            temperature: 0.7,
            maxTokens: settings?.max_response_length ?? 512,
            businessId: business_id,
          }, providerConfigs);
          reply = response.content?.trim() || '';
          if (response.error) console.error('[Widget] AI provider returned error:', response.error);
        } catch (error) {
          console.error('[Widget] AI generation failed:', error);
        }
      }
    }
  }

  // Do NOT manufacture/store a fallback AI message when generation failed.
  // Otherwise a provider outage can look like an unsolicited reply loop.
  if (!reply) {
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    return NextResponse.json({
      session_id: conversationId,
      visitor_id: customerId,
      reply: '',
      mode: 'error',
    }, { headers: CORS });
  }

  // Critical race guard: human takeover may have happened while the provider
  // was generating. Re-read the conversation immediately before persistence.
  const { data: beforeReply } = await supabase
    .from('conversations')
    .select('human_takeover, ai_enabled')
    .eq('id', conversationId)
    .eq('business_id', business_id)
    .maybeSingle();

  if (!beforeReply?.ai_enabled || beforeReply.human_takeover) {
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    return NextResponse.json({ session_id: conversationId, visitor_id: customerId, reply: '', mode: 'human' }, { headers: CORS });
  }

  const { data: insertedReply, error: replyInsertError } = await supabase
    .from('messages')
    .insert({
      business_id,
      conversation_id: conversationId,
      sender_type: 'agent',
      content: reply,
      content_type: 'text',
      is_inbound: false,
    })
    .select('id, created_at')
    .maybeSingle();

  if (replyInsertError) {
    // The database takeover trigger is authoritative. Never return generated
    // text to the browser when persistence was rejected.
    console.error('[Widget] Failed to store AI reply:', replyInsertError.message);
    const humanBlocked = /human takeover|AI reply blocked/i.test(replyInsertError.message);
    return NextResponse.json({
      session_id: conversationId,
      visitor_id: customerId,
      reply: '',
      mode: humanBlocked ? 'human' : 'error',
    }, { headers: CORS });
  }

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

  return NextResponse.json({
    session_id: conversationId,
    visitor_id: customerId,
    reply,
    reply_id: insertedReply?.id ?? null,
    reply_created_at: insertedReply?.created_at ?? null,
    mode: 'ai',
  }, { headers: CORS });
}
