import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  generateAIResponseWithFallback,
  type ProviderConfig,
} from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function isDomainAllowed(refererHost: string, config: Record<string, unknown>): boolean {
  const siteUrl = (config.site_url as string) || '';
  const allowedDomains = (config.allowed_domains as string[]) || [];

  const allowedHosts: string[] = [];
  if (siteUrl) {
    try { allowedHosts.push(new URL(siteUrl).hostname); } catch { /* ignore */ }
  }
  for (const d of allowedDomains) {
    if (d) allowedHosts.push(d.trim());
  }

  if (allowedHosts.length === 0) return true;
  if (!refererHost) return true;

  return allowedHosts.some((h) => refererHost === h || refererHost.endsWith('.' + h));
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const visitorId = req.nextUrl.searchParams.get('visitor_id');

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

  // Only return human/business replies. AI replies are returned directly by POST,
  // which prevents duplicate messages in the widget.
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_type, content_type')
    .eq('conversation_id', sessionId)
    .eq('business_id', businessId)
    .eq('sender_type', 'business')
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to load replies' }, { status: 500, headers: CORS });
  }

  return NextResponse.json({
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      sender: 'agent',
      content_type: message.content_type,
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

  if (!business_id || !message?.trim()) {
    return NextResponse.json({ error: 'Missing business_id or message' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const referer = req.headers.get('referer') || req.headers.get('origin') || '';
  let refererHost = '';
  try { refererHost = new URL(referer).hostname; } catch { /* empty */ }

  const { data: integration } = await supabase
    .from('integrations')
    .select('status, config')
    .eq('business_id', business_id)
    .eq('type', 'website_chat')
    .maybeSingle();

  if (!integration || integration.status !== 'connected') {
    return NextResponse.json({ error: 'Widget not active' }, { status: 404, headers: CORS });
  }

  const config = integration.config as Record<string, unknown>;

  if (!isDomainAllowed(refererHost, config)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403, headers: CORS });
  }

  let customerId = visitor_id;
  let conversationId: string | null = session_id;

  if (customerId) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, business_id')
      .eq('id', customerId)
      .eq('business_id', business_id)
      .maybeSingle();
    if (!existingCustomer) {
      customerId = null;
    }
  }

  if (!customerId) {
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({ business_id, name: 'Website Visitor', metadata: { source: 'website_widget' } })
      .select()
      .maybeSingle();
    customerId = newCustomer?.id ?? null;
  }

  if (conversationId) {
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, business_id')
      .eq('id', conversationId)
      .eq('business_id', business_id)
      .maybeSingle();
    if (!existingConv) {
      conversationId = null;
    }
  }

  if (!conversationId) {
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .maybeSingle();

    const { data: newConv } = await supabase
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
      .select()
      .maybeSingle();
    conversationId = newConv?.id ?? null;
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500, headers: CORS });
  }

  await supabase.from('messages').insert({
    business_id,
    conversation_id: conversationId,
    sender_type: 'customer',
    content: message,
    content_type: 'text',
    is_inbound: true,
  });

  const { data: conv } = await supabase
    .from('conversations')
    .select('agent_id')
    .eq('id', conversationId)
    .maybeSingle();

  let reply = '';
  if (conv?.agent_id) {
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
        // AI providers are global super-admin configurations, not business-scoped.
        // The schema has no business_id column, so filtering by business_id made
        // every widget request skip the AI layer and fall back to the canned reply.
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      if (providerRows && providerRows.length > 0) {
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('sender_type, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(10);

        // Load knowledge items for business context
        const { data: knowledgeItems } = await supabase
          .from('knowledge_items')
          .select('title, content, category')
          .eq('business_id', business_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(20);

        // AgentHub's public plans live in subscription_plans, not products.
        // Load the live plans so pricing questions use the same source as the website.
        const { data: subscriptionPlans } = await supabase
          .from('subscription_plans')
          .select('name, description, price_cents, yearly_price_cents, currency, billing_period, features, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        // Load products for business context
        const { data: products } = await supabase
          .from('products')
          .select('name, description, price, currency, availability, sku')
          .eq('business_id', business_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);

        let systemPrompt = `You are ${agent.name}. Purpose: ${agent.purpose}. Style: ${agent.communication_style || 'professional'}. Goal: ${agent.primary_goal || 'help customers'}.`;

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

        if (subscriptionPlans && subscriptionPlans.length > 0) {
          const planText = subscriptionPlans
            .map((plan) => {
              const currentPrice = typeof plan.price_cents === 'number'
                ? `${(plan.price_cents / 100).toFixed(2)} ${plan.currency || ''}`
                : 'Not provided';
              const yearlyPrice = typeof plan.yearly_price_cents === 'number'
                ? `${(plan.yearly_price_cents / 100).toFixed(2)} ${plan.currency || ''}`
                : 'Not provided';
              const features = Array.isArray(plan.features) && plan.features.length
                ? plan.features.join(', ')
                : 'No feature list provided';
              return `Plan: ${plan.name}\nDescription: ${plan.description || 'Not provided'}\nExact ${plan.billing_period || 'monthly'} Price: ${currentPrice}\nExact Yearly Price: ${yearlyPrice}\nFeatures: ${features}`;
            })
            .join('\n\n');
          systemPrompt += `\n\nLIVE SUBSCRIPTION PLANS AND PRICING:\n${planText}`;
        }

        systemPrompt += `\n\nPRICING RULES:
- When the customer asks for a price, pricing, cost, plans, package, subscription, quotation, or product rate, first use the exact prices in Products/Services or LIVE SUBSCRIPTION PLANS above.
- If an exact price is present in the context, state it clearly and directly. Do NOT tell the customer to contact sales for information that is already present.
- Never invent or guess a price.
- Only say that pricing is unavailable when the requested item genuinely has no price in the provided context.
- For AgentHub plan questions, use LIVE SUBSCRIPTION PLANS as the source of truth.`;
        if (settings?.custom_instructions) {
          systemPrompt += ` ${settings.custom_instructions}`;
        }
        if (settings?.response_language) {
          systemPrompt += ` Respond in ${settings.response_language}.`;
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
            maxTokens: settings?.max_response_length ?? 512,
          }));

          const response = await generateAIResponseWithFallback(
            {
              messages: aiMessages,
              temperature: 0.7,
              maxTokens: settings?.max_response_length ?? 512,
            },
            providerConfigs
          );
          reply = response.content || '';
          if (response.error) {
            reply = '';
          }
        } catch {
          reply = '';
        }
      }

      if (!reply) {
        const config2 = (integration.config ?? {}) as Record<string, unknown>;
        reply = (config2.welcome_message as string) || 'Thank you for your message. Our team will get back to you shortly.';
      }
    }
  }

  if (reply) {
    await supabase.from('messages').insert({
      business_id,
      conversation_id: conversationId,
      sender_type: 'agent',
      content: reply,
      content_type: 'text',
      is_inbound: false,
    });
  }

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

  return NextResponse.json({
    session_id: conversationId,
    visitor_id: customerId,
    reply,
  }, { headers: CORS });
}
