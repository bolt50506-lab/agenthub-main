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
| Instagram DMs are delivered through the same Meta webhook
| infrastructure as Messenger, just subscribed under the
| "instagram" product in your Meta App. Verification works the same
| way: echo back hub.challenge if hub.verify_token matches a connected
| integration.
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
    .eq('type', 'instagram')
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
*/

async function fetchSenderName(igsid: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${igsid}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!res.ok) return null;

    const data = (await res.json()) as { name?: string; username?: string };

    return data.name || data.username || null;
  } catch {
    return null;
  }
}

async function sendInstagramReply(igsid: string, accessToken: string, text: string) {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: igsid },
        message: { text },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('[Instagram] Send API error:', res.status, body.slice(0, 500));
  }

  return res.ok;
}

/*
|--------------------------------------------------------------------------
| POST - incoming DMs
|--------------------------------------------------------------------------
|
| Instagram delivers the same "messaging" array shape as Messenger, but
| entry.id is the Instagram Business Account ID rather than a Page ID.
|
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

  if (body.object !== 'instagram') {
    return NextResponse.json({ status: 'ignored' }, { headers: CORS });
  }

  const supabase = createServiceClient();

  for (const entry of body.entry || []) {
    const igAccountId = entry.id;

    for (const event of entry.messaging || []) {
      try {
        if (event.message?.is_echo) {
          continue;
        }

        const igsid = event.sender?.id;
        const textBody = event.message?.text?.trim();
        const messageId = event.message?.mid || null;

        if (!igAccountId || !igsid || !textBody) {
          continue;
        }

        const { data: integrations } = await supabase
          .from('integrations')
          .select('id, business_id, config')
          .eq('type', 'instagram')
          .eq('status', 'connected');

        const integration = (integrations || []).find(
          (row) => (row.config as Record<string, unknown> | null)?.instagram_account_id === igAccountId
        );

        const config = (integration?.config || {}) as Record<string, unknown>;

        if (!integration?.business_id) {
          console.error('[Instagram] No matching business for IG account:', igAccountId);
          continue;
        }

        const businessId = integration.business_id;
        const accessToken = config.access_token as string | undefined;

        if (!accessToken) {
          console.error('[Instagram] Missing access_token for business:', businessId);
          continue;
        }

        console.log('-----------------------------------');
        console.log('[Instagram] IG Account ID:', igAccountId);
        console.log('[Instagram] Sender IGSID:', igsid);
        console.log('[Instagram] Message ID:', messageId);
        console.log('[Instagram] Business ID:', businessId);
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
            .eq('metadata->>instagram_message_id', messageId)
            .limit(1)
            .maybeSingle();

          if (duplicateMessage) {
            console.log('[Instagram] Duplicate message ignored:', messageId);
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
          .eq('external_id', igsid)
          .maybeSingle();

        let customer = existingCustomer;

        if (!customer) {
          const senderName = await fetchSenderName(igsid, accessToken);

          const { data: newCustomer, error: customerCreateError } = await supabase
            .from('customers')
            .insert({
              business_id: businessId,
              name: senderName || 'Instagram User',
              external_id: igsid,
              metadata: { source: 'instagram', igsid },
            })
            .select()
            .single();

          if (customerCreateError || !newCustomer) {
            console.error('[Instagram] Customer creation error:', customerCreateError);
            continue;
          }

          customer = newCustomer;
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
          .eq('external_id', igsid)
          .eq('channel', 'instagram')
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
              title: customer.name || 'Instagram User',
              external_id: igsid,
              channel: 'instagram',
              ai_enabled: true,
              status: 'active',
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (conversationCreateError || !newConversation) {
            console.error('[Instagram] Conversation creation error:', conversationCreateError);
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
            channel: 'instagram',
            instagram_message_id: messageId,
            igsid,
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
          console.error('[Instagram] No AI providers enabled or business missing.');
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
You are the official Instagram DM assistant for ${business.name}.
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
- Keep replies suitable for Instagram DMs - short, casual, no long essays.
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
          console.error('[Instagram] AI generation failed:', aiResponse.error);
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
          metadata: { channel: 'instagram', provider: aiResponse.provider, model: aiResponse.model },
        });

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);

        const sent = await sendInstagramReply(igsid, accessToken, finalReply);

        console.log('[Instagram] Reply sent:', sent);
      } catch (error) {
        console.error('[Instagram] Error processing event:', error);
      }
    }
  }

  return NextResponse.json({ status: 'ok' }, { headers: CORS });
}
