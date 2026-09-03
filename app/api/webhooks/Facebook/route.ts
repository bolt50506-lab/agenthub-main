import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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

/*
|--------------------------------------------------------------------------
| GET - Meta webhook verification
|--------------------------------------------------------------------------
|
| Meta calls this once when you register the webhook URL in your App
| dashboard. It sends hub.verify_token and expects it echoed back via
| hub.challenge if the token matches what you configured.
|
| This app is multi-tenant (one Messenger integration per business), so
| there is no per-business URL - the same webhook URL is shared. We
| accept the verification if ANY connected facebook_messenger
| integration has a matching verify_token.
|
*/

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: integrations } = await supabase
    .from('integrations')
    .select('config')
    .eq('type', 'facebook_messenger')
    .eq('status', 'connected');

  const matched = (integrations || []).some(
    (integration) => (integration.config as Record<string, unknown> | null)?.verify_token === token
  );

  if (matched) {
    return new NextResponse(challenge, { status: 200, headers: CORS });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403, headers: CORS });
}

/*
|--------------------------------------------------------------------------
| Best-effort sender profile lookup
|--------------------------------------------------------------------------
|
| Unlike WhatsApp, Messenger webhooks do not include the sender's name.
| It has to be fetched separately from the Graph API. This is
| best-effort: if it fails (missing permission, rate limit, deleted
| profile) we fall back to a generic name rather than failing the whole
| message.
|
*/

async function fetchSenderName(psid: string, pageAccessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${psid}?fields=first_name,last_name&access_token=${encodeURIComponent(pageAccessToken)}`
    );

    if (!res.ok) return null;

    const data = (await res.json()) as { first_name?: string; last_name?: string };
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();

    return name || null;
  } catch {
    return null;
  }
}

async function sendMessengerReply(psid: string, pageAccessToken: string, text: string) {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text },
        messaging_type: 'RESPONSE',
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('[Messenger] Send API error:', res.status, body.slice(0, 500));
  }

  return res.ok;
}

/*
|--------------------------------------------------------------------------
| POST - incoming messages
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
        };
      }>;
    }>;
  };

  if (body.object !== 'page') {
    return NextResponse.json({ status: 'ignored' }, { headers: CORS });
  }

  const supabase = createServiceClient();

  for (const entry of body.entry || []) {
    const pageId = entry.id;

    for (const event of entry.messaging || []) {
      try {
        // Echoes are messages the connected Page itself sent (e.g. from
        // the Page inbox). Never treat our own replies as new customer
        // messages.
        if (event.message?.is_echo) {
          continue;
        }

        const psid = event.sender?.id;
        const textBody = event.message?.text?.trim();
        const messageId = event.message?.mid || null;

        if (!pageId || !psid || !textBody) {
          continue;
        }

        const { data: integrations } = await supabase
          .from('integrations')
          .select('id, business_id, config')
          .eq('type', 'facebook_messenger')
          .eq('status', 'connected');

        const integration = (integrations || []).find(
          (row) => (row.config as Record<string, unknown> | null)?.page_id === pageId
        );

        const config = (integration?.config || {}) as Record<string, unknown>;

        if (!integration?.business_id) {
          console.error('[Messenger] No matching business for page:', pageId);
          continue;
        }

        const businessId = integration.business_id;
        const pageAccessToken = config.page_access_token as string | undefined;

        if (!pageAccessToken) {
          console.error('[Messenger] Missing page_access_token for business:', businessId);
          continue;
        }

        console.log('-----------------------------------');
        console.log('[Messenger] Page ID:', pageId);
        console.log('[Messenger] Sender PSID:', psid);
        console.log('[Messenger] Message ID:', messageId);
        console.log('[Messenger] Business ID:', businessId);
        console.log('-----------------------------------');

        /*
        --------------------------------------------------------------------
        Duplicate protection
        --------------------------------------------------------------------
        */

        if (messageId) {
          const { data: duplicateMessage } = await supabase
            .from('messages')
            .select('id')
            .eq('business_id', businessId)
            .eq('metadata->>messenger_message_id', messageId)
            .limit(1)
            .maybeSingle();

          if (duplicateMessage) {
            console.log('[Messenger] Duplicate message ignored:', messageId);
            continue;
          }
        }

        /*
        --------------------------------------------------------------------
        Customer lookup / creation
        --------------------------------------------------------------------
        */

        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id, name, phone, email, external_id')
          .eq('business_id', businessId)
          .eq('external_id', psid)
          .maybeSingle();

        let customer = existingCustomer;

        if (!customer) {
          const senderName = await fetchSenderName(psid, pageAccessToken);

          const { data: newCustomer, error: customerCreateError } = await supabase
            .from('customers')
            .insert({
              business_id: businessId,
              name: senderName || 'Messenger User',
              external_id: psid,
              metadata: { source: 'facebook_messenger', psid },
            })
            .select()
            .single();

          if (customerCreateError || !newCustomer) {
            console.error('[Messenger] Customer creation error:', customerCreateError);
            continue;
          }

          customer = newCustomer;
        }

        if (!customer) {
          console.error(
            '[Messenger] Customer record unexpectedly missing after lookup/creation - skipping this message.'
          );
          continue;
        }

        /*
        --------------------------------------------------------------------
        Conversation lookup / creation
        --------------------------------------------------------------------
        */

        const { data: agent } = await supabase
          .from('agents')
          .select('id, name, purpose, description, communication_style, primary_goal')
          .eq('business_id', businessId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        const { data: existingConversation } = await supabase
          .from('conversations')
          .select('id, agent_id')
          .eq('business_id', businessId)
          .eq('external_id', psid)
          .eq('channel', 'facebook_messenger')
          .maybeSingle();

        let conversation = existingConversation;

        if (!conversation) {
          const { data: newConversation, error: conversationCreateError } = await supabase
            .from('conversations')
            .insert({
              business_id: businessId,
              agent_id: agent?.id || null,
              customer_id: customer.id,
              type: 'private',
              title: customer.name || 'Messenger User',
              external_id: psid,
              channel: 'facebook_messenger',
              ai_enabled: true,
              status: 'active',
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (conversationCreateError || !newConversation) {
            console.error('[Messenger] Conversation creation error:', conversationCreateError);
            continue;
          }

          conversation = newConversation;
        } else {
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversation.id);
        }

        /*
        --------------------------------------------------------------------
        Store incoming message
        --------------------------------------------------------------------
        */

        await supabase.from('messages').insert({
          business_id: businessId,
          conversation_id: conversation.id,
          sender_type: 'customer',
          sender_id: customer.id,
          content: textBody,
          content_type: 'text',
          is_inbound: true,
          metadata: {
            channel: 'facebook_messenger',
            messenger_message_id: messageId,
            psid,
          },
        });

        /*
        --------------------------------------------------------------------
        Load business + AI providers, generate a reply
        --------------------------------------------------------------------
        */

        const { data: business } = await supabase
          .from('businesses')
          .select('id, name, industry, description, website, phone, address')
          .eq('id', businessId)
          .maybeSingle();

        const { data: agentSettings } = agent
          ? await supabase
              .from('agent_settings')
              .select('tone, response_language, custom_instructions, max_response_length')
              .eq('business_id', businessId)
              .eq('agent_id', agent.id)
              .maybeSingle()
          : { data: null };

        const { data: knowledgeItems } = await supabase
          .from('knowledge_items')
          .select('title, category, content, tags')
          .eq('business_id', businessId)
          .eq('status', 'active')
          .limit(50);

        const { data: products } = await supabase
          .from('products')
          .select('name, description')
          .eq('business_id', businessId)
          .limit(100);

        const { data: providerRows } = await supabase
          .from('ai_provider_configs')
          .select('provider, model, base_url, api_key_encrypted, priority')
          .eq('is_enabled', true)
          .order('priority', { ascending: true });

        if (!providerRows?.length || !business) {
          console.error('[Messenger] No AI providers enabled or business missing.');
          continue;
        }

        const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({
          provider: row.provider,
          apiKey: row.api_key_encrypted || undefined,
          apiUrl: row.base_url || undefined,
          model: row.model,
          temperature: 0.7,
          maxTokens: 1024,
        }));

        const knowledgeContext = knowledgeItems?.length
          ? knowledgeItems
              .map((item) => `Title: ${item.title}\nCategory: ${item.category}\nContent: ${item.content}`)
              .join('\n\n---\n\n')
          : 'No additional business knowledge has been added yet.';

        const productsContext = products?.length
          ? products.map((p) => `Product: ${p.name}\nDescription: ${p.description || 'Not provided'}`).join('\n\n')
          : 'No products have been added yet.';

        const systemPrompt = `
You are the official Facebook Messenger assistant for ${business.name}.
You represent THIS business only.

Business Name: ${business.name}
Industry: ${business.industry || 'Not specified'}
Description: ${business.description || 'Not specified'}

Agent: ${agent?.name || `${business.name} Assistant`}
Purpose: ${agent?.purpose || 'Help customers and answer business questions'}
Tone: ${agentSettings?.tone || 'professional'}
Response Language: ${agentSettings?.response_language || 'English'}
Custom Instructions: ${agentSettings?.custom_instructions || 'None'}

Products:
${productsContext}

Knowledge:
${knowledgeContext}

Rules:
- Never mention AgentHub, APIs, providers, or internal systems.
- Do not invent products, prices, or policies.
- Keep replies suitable for Messenger - short, natural, no long essays.
        `.trim();

        const aiResponse = await generateAIResponseWithFallback(
          {
            messages: [{ role: 'user', content: textBody }],
            systemPrompt,
            temperature: 0.7,
            maxTokens: agentSettings?.max_response_length ? Math.min(1024, agentSettings.max_response_length) : 1024,
            businessId,
          },
          providerConfigs
        );

        if (aiResponse.error || !aiResponse.content?.trim()) {
          console.error('[Messenger] AI generation failed:', aiResponse.error);
          continue;
        }

        const finalReply = aiResponse.content.trim();

        await supabase.from('messages').insert({
          business_id: businessId,
          conversation_id: conversation.id,
          sender_type: 'agent',
          sender_id: agent?.id || null,
          content: finalReply,
          content_type: 'text',
          is_inbound: false,
          metadata: { channel: 'facebook_messenger', provider: aiResponse.provider, model: aiResponse.model },
        });

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);

        const sent = await sendMessengerReply(psid, pageAccessToken, finalReply);

        console.log('[Messenger] Reply sent:', sent);
      } catch (error) {
        console.error('[Messenger] Error processing event:', error);
      }
    }
  }

  return NextResponse.json({ status: 'ok' }, { headers: CORS });
}
