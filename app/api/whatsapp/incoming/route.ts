import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  generateAIResponseWithFallback,
  type ProviderConfig,
} from '@/lib/ai/providers';
import { shouldReplyInGroup } from '@/lib/group-rules';
import { detectAppointmentRequest } from '@/lib/appointments';

export const dynamic = 'force-dynamic';

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function isWhatsAppGroup(from: string) {
  return from.endsWith('@g.us');
}

function isWhatsAppLid(from: string) {
  return from.endsWith('@lid');
}

/*
|--------------------------------------------------------------------------
| Resolve the customer's real phone number
|--------------------------------------------------------------------------
|
| Priority:
| 1. An explicit phone_number sent by the WhatsApp service (this is only
|    sent when Baileys has actually resolved a @lid sender to a real
|    number, or when the sender was already a normal @s.whatsapp.net /
|    @c.us JID).
| 2. If `from` is a normal @s.whatsapp.net / @c.us JID, derive the phone
|    number directly from it.
| 3. If `from` is a @lid identifier and no phone_number was supplied,
|    return null. A @lid numeric id is NOT a phone number and must never
|    be stored as one.
|
*/

function resolvePhoneNumber(
  from: string,
  phoneNumberFromBody: string
) {
  if (phoneNumberFromBody) {
    return phoneNumberFromBody;
  }

  if (isWhatsAppLid(from)) {
    return null;
  }

  const derived = from
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .trim();

  return derived || null;
}

function limitText(text: string, maxLength?: number | null) {
  if (!maxLength || maxLength <= 0) {
    return text;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).trim();
}

/*
|--------------------------------------------------------------------------
| POST
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const sessionId =
      typeof body.session_id === 'string'
        ? body.session_id.trim()
        : '';

    const from =
      typeof body.from === 'string'
        ? body.from.trim()
        : '';

    const message =
      typeof body.message === 'string'
        ? body.message.trim()
        : '';

    const pushName =
      typeof body.push_name === 'string' &&
      body.push_name.trim()
        ? body.push_name.trim()
        : null;

    const phoneNumberFromBody =
      typeof body.phone_number === 'string'
        ? body.phone_number.trim()
        : '';

    const whatsappMessageId =
      typeof body.message_id === 'string' &&
      body.message_id.trim()
        ? body.message_id.trim()
        : null;

    console.log('-----------------------------------');
    console.log('[WhatsApp API] Route loaded');
    console.log('[WhatsApp API] Incoming message:', {
      sessionId,
      from,
      message,
      pushName,
      phoneNumberFromBody: phoneNumberFromBody || null,
      whatsappMessageId,
    });
    console.log('-----------------------------------');

    /*
    |--------------------------------------------------------------------------
    | Validate incoming request
    |--------------------------------------------------------------------------
    */

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: 'Missing session_id',
        },
        { status: 400 }
      );
    }

    if (!from) {
      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: 'Missing sender',
        },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: 'Missing message',
        },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    /*
    |--------------------------------------------------------------------------
    | 1. Find WhatsApp session
    |--------------------------------------------------------------------------
    |
    | This is the most important part of multi-business routing.
    |
    | session_id
    |      ↓
    | whatsapp_sessions
    |      ↓
    | business_id
    |      ↓
    | Everything belongs to this business
    |
    */

    const {
      data: whatsappSession,
      error: sessionError,
    } = await supabase
      .from('whatsapp_sessions')
      .select(
        `
          id,
          business_id,
          integration_id,
          session_id
        `
      )
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error(
        '[WhatsApp API] WhatsApp session database error:',
        sessionError
      );

      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: sessionError.message,
        },
        { status: 500 }
      );
    }

    if (!whatsappSession) {
      console.error(
        '[WhatsApp API] WhatsApp session not found:',
        sessionId
      );

      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: 'WhatsApp session not found',
        },
        { status: 404 }
      );
    }

    const businessId = whatsappSession.business_id;

    // Reply delivery rule is stored in the WhatsApp integration config so
    // each business can control text/voice behavior independently.
    let voiceReplyMode: 'text_only' | 'voice_only' | 'text_and_voice' | 'random' = 'text_and_voice';

    if (whatsappSession.integration_id) {
      const { data: whatsappIntegration } = await supabase
        .from('integrations')
        .select('config')
        .eq('id', whatsappSession.integration_id)
        .maybeSingle();

      const configuredMode = (whatsappIntegration?.config as Record<string, unknown> | null)?.voice_reply_mode;

      if (
        configuredMode === 'text_only' ||
        configuredMode === 'voice_only' ||
        configuredMode === 'text_and_voice' ||
        configuredMode === 'random'
      ) {
        voiceReplyMode = configuredMode;
      }
    }

    if (!businessId) {
      console.error(
        '[WhatsApp API] WhatsApp session has no business_id:',
        whatsappSession.id
      );

      return NextResponse.json(
        {
          success: false,
          reply: null,
          error:
            'WhatsApp session is not connected to a business',
        },
        { status: 500 }
      );
    }

    console.log(
      '[WhatsApp API] WhatsApp session found:',
      whatsappSession.id
    );

    console.log(
      '[WhatsApp API] Business ID:',
      businessId
    );

    /*
    |--------------------------------------------------------------------------
    | 2. Load the business
    |--------------------------------------------------------------------------
    */

    const {
      data: business,
      error: businessError,
    } = await supabase
      .from('businesses')
      .select(
        `
          id,
          name,
          industry,
          description,
          website,
          phone,
          address,
          timezone,
          working_hours
        `
      )
      .eq('id', businessId)
      .maybeSingle();

    if (businessError) {
      console.error(
        '[WhatsApp API] Business database error:',
        businessError
      );

      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: businessError.message,
        },
        { status: 500 }
      );
    }

    if (!business) {
      console.error(
        '[WhatsApp API] Business not found:',
        businessId
      );

      return NextResponse.json(
        {
          success: false,
          reply: null,
          error: 'Business not found',
        },
        { status: 404 }
      );
    }

    console.log(
      '[WhatsApp API] Business loaded:',
      {
        id: business.id,
        name: business.name,
        industry: business.industry,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | 2b. Duplicate message protection
    |--------------------------------------------------------------------------
    |
    | Baileys can occasionally re-emit the same message (retries, app
    | restarts, multi-device sync). If we already stored a message with
    | this exact WhatsApp message id for this business, do not generate
    | a second AI reply.
    |
    */

    if (whatsappMessageId) {
      const {
        data: duplicateMessage,
        error: duplicateCheckError,
      } = await supabase
        .from('messages')
        .select('id')
        .eq('business_id', businessId)
        .eq(
          'metadata->>whatsapp_message_id',
          whatsappMessageId
        )
        .limit(1)
        .maybeSingle();

      if (duplicateCheckError) {
        console.error(
          '[WhatsApp API] Duplicate check error:',
          duplicateCheckError
        );
      }

      if (duplicateMessage) {
        console.log(
          '[WhatsApp API] Duplicate message ignored:',
          whatsappMessageId
        );

        return NextResponse.json({
          success: true,
          reply: null,
          ignored: true,
          reason: 'Duplicate message',
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Determine if this is a WhatsApp group
    |--------------------------------------------------------------------------
    */

    const isGroup = isWhatsAppGroup(from);

    console.log(
      '[WhatsApp API] Message type:',
      isGroup ? 'GROUP' : 'PRIVATE'
    );

    /*
    |--------------------------------------------------------------------------
    | 4. Load business agent
    |--------------------------------------------------------------------------
    */

    const {
      data: agent,
      error: agentError,
    } = await supabase
      .from('agents')
      .select(
        `
          id,
          business_id,
          name,
          purpose,
          description,
          communication_style,
          primary_goal,
          supported_languages,
          status,
          ai_provider,
          knowledge_source_ids,
          enabled_capabilities
        `
      )
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (agentError) {
      console.error(
        '[WhatsApp API] Agent database error:',
        agentError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Group rules
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | If group_ai_enabled = false
    |
    | The AI must NOT generate or send a reply.
    |
    */

    let groupRule: any = null;

    if (isGroup) {
      const {
        data: groupRules,
        error: groupRuleError,
      } = await supabase
        .from('group_rules')
        .select(
          `
            id,
            business_id,
            agent_id,
            group_ai_enabled,
            response_mode,
            allowed_category_ids,
            allowed_product_ids,
            allow_price_list,
            allow_quotation,
            require_product_name,
            response_language,
            max_response_length,
            custom_rules
          `
        )
        .eq('business_id', businessId)
        .maybeSingle();

      if (groupRuleError) {
        console.error(
          '[WhatsApp API] Group rule database error:',
          groupRuleError
        );
      }

      groupRule = groupRules;

      /*
      ------------------------------------------------------------------------
      No group rule found
      ------------------------------------------------------------------------
      */

      if (!groupRule) {
        console.log(
          '[WhatsApp API] No group rule found. Ignoring group message.'
        );

        return NextResponse.json({
          success: true,
          ignored: true,
          reply: null,
          reason: 'No group rule configured',
        });
      }

      /*
      ------------------------------------------------------------------------
      Apply the configured response mode to THIS message.

      BUG THIS FIXES: the previous version only ever checked
      group_ai_enabled and response_mode === 'disabled'. Every other mode
      (price_inquiries_only, mentions_only, custom_rules, reply_to_all)
      fell through and generated a reply unconditionally - so a rule set
      to "only reply to price questions" or "only reply when mentioned"
      was silently ignored and the agent replied to every group message
      anyway. shouldReplyInGroup() is the single source of truth for
      this decision and is shared with the Cloud API webhook, so both
      channels now enforce the same rule the same way.
      ------------------------------------------------------------------------
      */

      const groupDecision = shouldReplyInGroup(
        groupRule,
        message
      );

      console.log(
        '[WhatsApp API] Group reply decision:',
        groupDecision
      );

      if (!groupDecision.shouldReply) {
        return NextResponse.json({
          success: true,
          ignored: true,
          reply: null,
          reason: groupDecision.reason,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 6. Load agent settings
    |--------------------------------------------------------------------------
    */

    let agentSettings: any = null;

    if (agent) {
      const {
        data: settings,
        error: settingsError,
      } = await supabase
        .from('agent_settings')
        .select(
          `
            id,
            agent_id,
            business_id,
            tone,
            greeting_behavior,
            auto_create_leads,
            appointments_enabled,
            auto_followups_enabled,
            max_response_length,
            response_language,
            custom_instructions
          `
        )
        .eq('business_id', businessId)
        .eq('agent_id', agent.id)
        .maybeSingle();

      if (settingsError) {
        console.error(
          '[WhatsApp API] Agent settings error:',
          settingsError
        );
      }

      agentSettings = settings;
    }

    /*
    |--------------------------------------------------------------------------
    | 7. Load only THIS BUSINESS's products
    |--------------------------------------------------------------------------
    */

    const {
      data: products,
      error: productsError,
    } = await supabase
      .from('products')
      .select(
        `
          id,
          business_id,
          category_id,
          name,
          description,
          price,
          currency,
          availability,
          status
        `
      )
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(100);

    if (productsError) {
      console.error(
        '[WhatsApp API] Products error:',
        productsError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 8. Load only THIS BUSINESS's knowledge
    |--------------------------------------------------------------------------
    */

    const {
      data: knowledgeItems,
      error: knowledgeError,
    } = await supabase
      .from('knowledge_items')
      .select(
        `
          id,
          business_id,
          title,
          category,
          content,
          tags,
          metadata,
          status
        `
      )
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(50);

    if (knowledgeError) {
      console.error(
        '[WhatsApp API] Knowledge error:',
        knowledgeError
      );
    }

    // Public AgentHub pricing is stored in subscription_plans, not products.
    // Load active plans so WhatsApp uses the same live pricing source as the website.
    const {
      data: subscriptionPlans,
      error: subscriptionPlansError,
    } = await supabase
      .from('subscription_plans')
      .select(
        `
          name,
          description,
          price_cents,
          yearly_price_cents,
          currency,
          billing_period,
          features,
          is_active,
          sort_order
        `
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (subscriptionPlansError) {
      console.error(
        '[WhatsApp API] Subscription plans error:',
        subscriptionPlansError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 9. GROUP MESSAGE HANDLING
    |--------------------------------------------------------------------------
    |
    | We do not create customers or leads for groups.
    |
    */

    if (isGroup) {
      console.log(
        '[WhatsApp API] Processing allowed group message.'
      );

      const allowedProducts =
        groupRule?.allowed_product_ids?.length
          ? (products || []).filter((product) =>
              groupRule.allowed_product_ids.includes(
                product.id
              )
            )
          : products || [];

      const allowedCategories =
        groupRule?.allowed_category_ids?.length
          ? allowedProducts.filter((product) =>
              groupRule.allowed_category_ids.includes(
                product.category_id
              )
            )
          : allowedProducts;

      const productContext =
        allowedCategories.length > 0
          ? allowedCategories
              .map(
                (product) =>
                  `Product: ${product.name}\nDescription: ${
                    product.description || 'Not provided'
                  }\nExact Price: ${product.price != null ? `${product.price} ${product.currency || ''}` : 'Not provided'}`
              )
              .join('\n\n')
          : 'No specific products are configured for this group.';

      /*
      ------------------------------------------------------------------------
      Load providers
      ------------------------------------------------------------------------
      */

      const {
        data: providerRows,
        error: providerError,
      } = await supabase
        .from('ai_provider_configs')
        .select(
          `
            id,
            provider,
            api_key_encrypted,
            base_url,
            model,
            priority,
            is_enabled,
            is_primary,
            display_name
          `
        )
        .eq('is_enabled', true)
        .order('priority', {
          ascending: true,
        });

      if (providerError || !providerRows?.length) {
        console.error(
          '[WhatsApp API] AI providers unavailable:',
          providerError
        );

        return NextResponse.json({
          success: true,
          reply: null,
          error:
            'No enabled AI provider is available',
        });
      }

      const providerConfigs: ProviderConfig[] =
        providerRows.map((row) => ({
          provider: row.provider,
          apiKey:
            row.api_key_encrypted || undefined,
          apiUrl: row.base_url || undefined,
          model: row.model,
          temperature: 0.7,
          maxTokens: 1024,
        }));

      const groupSystemPrompt = `
You are the WhatsApp group assistant for ${business.name}.

Business information:
Business Name: ${business.name}
Industry: ${business.industry || 'Not specified'}
Description: ${business.description || 'Not specified'}

Your active agent:
Name: ${agent?.name || business.name}
Purpose: ${agent?.purpose || 'Customer assistance'}

IMPORTANT GROUP RULES:

- You are responding inside a WhatsApp group.
- Only answer according to the configured group rules.
- Do not respond to unrelated messages.
- Keep replies concise.
- Do not mention AgentHub, APIs, providers, databases or internal systems.
- Do not pretend to perform actions that were not actually performed.

Response Mode:
${groupRule?.response_mode || 'restricted'}

Require Product Name:
${groupRule?.require_product_name ? 'YES' : 'NO'}

Allow Price List:
${groupRule?.allow_price_list ? 'YES' : 'NO'}

Allow Quotation:
${groupRule?.allow_quotation ? 'YES' : 'NO'}

Allowed Products:

${productContext}

Custom Group Rules:

${JSON.stringify(groupRule?.custom_rules || [])}
      `.trim();

      const aiResponse =
        await generateAIResponseWithFallback(
          {
            messages: [
              {
                role: 'user',
                content: message,
              },
            ],

            systemPrompt: groupSystemPrompt,

            temperature: 0.7,

            maxTokens: 1024,

            businessId,
          },
          providerConfigs
        );

      if (
        aiResponse.error ||
        !aiResponse.content?.trim()
      ) {
        console.error(
          '[WhatsApp API] Group AI failed:',
          aiResponse.error
        );

        return NextResponse.json({
          success: true,
          reply: null,
          error: aiResponse.error,
        });
      }

      const finalReply = limitText(
        aiResponse.content.trim(),
        groupRule?.max_response_length
      );

      return NextResponse.json({
        success: true,
        reply: finalReply,
        provider: aiResponse.provider,
        model: aiResponse.model,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | 10. PRIVATE CUSTOMER MESSAGE
    |--------------------------------------------------------------------------
    */

    const phone = resolvePhoneNumber(
      from,
      phoneNumberFromBody
    );

    console.log('[WhatsApp API] Resolved phone:', phone || 'none (lid not resolved)');

    /*
    |--------------------------------------------------------------------------
    | Find existing customer
    |--------------------------------------------------------------------------
    */

    let customer: any = null;

    const {
      data: existingCustomer,
      error: customerLookupError,
    } = await supabase
      .from('customers')
      .select(
        `
          id,
          business_id,
          name,
          phone,
          email,
          external_id
        `
      )
      .eq('business_id', businessId)
      .eq('external_id', from)
      .maybeSingle();

    if (customerLookupError) {
      console.error(
        '[WhatsApp API] Customer lookup error:',
        customerLookupError
      );
    }

    customer = existingCustomer;

    /*
    |--------------------------------------------------------------------------
    | Create customer if first contact
    |--------------------------------------------------------------------------
    */

    if (!customer) {
      const {
        data: newCustomer,
        error: customerCreateError,
      } = await supabase
        .from('customers')
        .insert({
          business_id: businessId,
          name:
            pushName ||
            phone ||
            'WhatsApp Customer',
          phone: phone || null,
          external_id: from,
          metadata: {
            source: 'whatsapp',
            whatsapp_id: from,
            session_id: sessionId,
            push_name: pushName,
          },
        })
        .select()
        .single();

      if (customerCreateError) {
        console.error(
          '[WhatsApp API] Customer creation error:',
          customerCreateError
        );

        return NextResponse.json(
          {
            success: false,
            reply: null,
            error: customerCreateError.message,
          },
          { status: 500 }
        );
      }

      customer = newCustomer;

      console.log(
        '[WhatsApp API] New customer created:',
        customer.id
      );
    } else {
      /*
      ------------------------------------------------------------------------
      Existing customer: backfill phone/name if we now know more than we
      did before. Never overwrite a meaningful existing name with an
      empty value, and never overwrite a real phone number we already
      have on file.
      ------------------------------------------------------------------------
      */

      const customerUpdates: Record<string, unknown> = {};

      if (!customer.phone && phone) {
        customerUpdates.phone = phone;
      }

      const hasPlaceholderName =
        !customer.name ||
        customer.name === 'WhatsApp Customer' ||
        customer.name === customer.phone;

      if (pushName && hasPlaceholderName) {
        customerUpdates.name = pushName;
      }

      if (Object.keys(customerUpdates).length > 0) {
        const {
          data: updatedCustomer,
          error: customerUpdateError,
        } = await supabase
          .from('customers')
          .update(customerUpdates)
          .eq('id', customer.id)
          .select()
          .single();

        if (customerUpdateError) {
          console.error(
            '[WhatsApp API] Customer update error:',
            customerUpdateError
          );
        } else {
          customer = updatedCustomer;

          console.log(
            '[WhatsApp API] Customer backfilled:',
            customerUpdates
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 11. Find or create conversation
    |--------------------------------------------------------------------------
    */

    let conversation: any = null;

    const {
      data: existingConversation,
      error: conversationLookupError,
    } = await supabase
      .from('conversations')
      .select(
        `
          id,
          business_id,
          agent_id,
          customer_id,
          type,
          title,
          external_id,
          channel,
          ai_enabled,
          status
        `
      )
      .eq('business_id', businessId)
      .eq('external_id', from)
      .eq('channel', 'whatsapp')
      .maybeSingle();

    if (conversationLookupError) {
      console.error(
        '[WhatsApp API] Conversation lookup error:',
        conversationLookupError
      );
    }

    conversation = existingConversation;

    if (!conversation) {
      const {
        data: newConversation,
        error: conversationCreateError,
      } = await supabase
        .from('conversations')
        .insert({
          business_id: businessId,
          agent_id: agent?.id || null,
          customer_id: customer.id,
          type: 'private',
          title:
            customer.name ||
            phone ||
            'WhatsApp Customer',
          external_id: from,
          channel: 'whatsapp',
          ai_enabled: true,
          status: 'active',
          last_message_at:
            new Date().toISOString(),
        })
        .select()
        .single();

      if (conversationCreateError) {
        console.error(
          '[WhatsApp API] Conversation creation error:',
          conversationCreateError
        );

        return NextResponse.json(
          {
            success: false,
            reply: null,
            error:
              conversationCreateError.message,
          },
          { status: 500 }
        );
      }

      conversation = newConversation;

      console.log(
        '[WhatsApp API] New conversation created:',
        conversation.id
      );
    } else {
      await supabase
        .from('conversations')
        .update({
          last_message_at:
            new Date().toISOString(),
        })
        .eq('id', conversation.id);
    }

    /*
    |--------------------------------------------------------------------------
    | 12. Save incoming customer message
    |--------------------------------------------------------------------------
    */

    const {
      error: incomingMessageError,
    } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: customer.id,
        content: message,
        content_type: 'text',
        metadata: {
          channel: 'whatsapp',
          whatsapp_id: from,
          whatsapp_message_id: whatsappMessageId,
          session_id: sessionId,
        },
      });

    if (incomingMessageError) {
      console.error(
        '[WhatsApp API] Incoming message save error:',
        incomingMessageError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 12b. Load recent conversation history
    |--------------------------------------------------------------------------
    |
    | THIS WAS THE ROOT CAUSE of the AI seeming to "restart" mid
    | conversation - every reply was generated from the customer's
    | single latest message alone, with zero memory of anything said
    | before it. A short reply like "Oh wonderful" carries no meaning
    | on its own, so the AI fell back to a generic opener ("Hello! How
    | can I help you today?") instead of continuing naturally.
    |
    | Fetch the last N messages in this conversation (already includes
    | the one just saved above) and turn them into a proper
    | user/assistant message history for the AI.
    |
    */

    const HISTORY_LIMIT = 16;

    const { data: historyRows } = await supabase
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    const conversationHistory = (historyRows || [])
      .reverse()
      .filter((row) => row.content && row.content.trim())
      .map((row) => ({
        role: (row.sender_type === 'agent' ? 'assistant' : 'user') as
          | 'user'
          | 'assistant',
        content: row.content,
      }));

    // Safety net: if history somehow comes back empty (e.g. the insert
    // above failed), still send at least the current message so the
    // AI isn't called with zero input.
    if (conversationHistory.length === 0) {
      conversationHistory.push({ role: 'user', content: message });
    }

    /*
    |--------------------------------------------------------------------------
    | 13. Automatic lead creation
    |--------------------------------------------------------------------------
    |
    | Controlled by:
    |
    | agent_settings.auto_create_leads
    |
    */

    let lead: any = null;

    const shouldCreateLead =
      agentSettings?.auto_create_leads === true;

    if (shouldCreateLead) {
      const {
        data: existingLead,
        error: leadLookupError,
      } = await supabase
        .from('leads')
        .select(
          `
            id,
            business_id,
            customer_id,
            conversation_id,
            status
          `
        )
        .eq('business_id', businessId)
        .eq('customer_id', customer.id)
        .eq(
          'conversation_id',
          conversation.id
        )
        .maybeSingle();

      if (leadLookupError) {
        console.error(
          '[WhatsApp API] Lead lookup error:',
          leadLookupError
        );
      }

      lead = existingLead;

      /*
      ------------------------------------------------------------------------
      Create lead only once for this customer/conversation
      ------------------------------------------------------------------------
      */

      if (!lead) {
        const {
          data: newLead,
          error: leadCreateError,
        } = await supabase
          .from('leads')
          .insert({
            business_id: businessId,
            customer_id: customer.id,
            conversation_id:
              conversation.id,
            name:
              customer.name ||
              phone ||
              'WhatsApp Customer',
            phone:
              customer.phone ||
              phone ||
              null,
            email:
              customer.email || null,
            source: 'whatsapp',
            requirement: message,
            status: 'new',
          })
          .select()
          .single();

        if (leadCreateError) {
          console.error(
            '[WhatsApp API] Lead creation error:',
            leadCreateError
          );
        } else {
          lead = newLead;

          console.log(
            '[WhatsApp API] Lead created:',
            lead.id
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 13b. Automatic follow-up scheduling
    |--------------------------------------------------------------------------
    |
    | Controlled by agent_settings.auto_followups_enabled. This was
    | previously a dashboard toggle that did nothing - it was fetched
    | but never read anywhere in the pipeline.
    |
    | Behavior: whenever this lead has no pending auto follow-up task
    | scheduled, create one for 24 hours from now ("check in if they've
    | gone quiet"). If the lead messages again before that task fires,
    | push it out another 24 hours instead of stacking a second task -
    | this file only ever holds ONE pending auto follow-up per lead.
    | The actual sending happens in a separate scheduled job
    | (app/api/cron/follow-ups/route.ts), not here - this route only
    | ever responds to an inbound message, it does not send unprompted
    | outbound messages itself.
    |
    */

    if (
      lead &&
      agentSettings?.auto_followups_enabled === true
    ) {
      const followUpAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const {
        data: existingAutoFollowUp,
      } = await supabase
        .from('follow_up_tasks')
        .select('id')
        .eq('business_id', businessId)
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .eq('notes', 'auto:lead-checkin')
        .maybeSingle();

      if (existingAutoFollowUp) {
        await supabase
          .from('follow_up_tasks')
          .update({ scheduled_at: followUpAt })
          .eq('id', existingAutoFollowUp.id);
      } else {
        const { error: followUpCreateError } = await supabase
          .from('follow_up_tasks')
          .insert({
            business_id: businessId,
            lead_id: lead.id,
            task_type: 'message',
            scheduled_at: followUpAt,
            status: 'pending',
            notes: 'auto:lead-checkin',
          });

        if (followUpCreateError) {
          console.error(
            '[WhatsApp API] Auto follow-up creation error:',
            followUpCreateError
          );
        } else {
          console.log(
            '[WhatsApp API] Auto follow-up scheduled for lead:',
            lead.id,
            'at',
            followUpAt
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 14. Load AI providers
    |--------------------------------------------------------------------------
    */

    const {
      data: providerRows,
      error: providerError,
    } = await supabase
      .from('ai_provider_configs')
      .select(
        `
          id,
          provider,
          api_key_encrypted,
          base_url,
          model,
          priority,
          is_enabled,
          is_primary,
          display_name
        `
      )
      .eq('is_enabled', true)
      .order('priority', {
        ascending: true,
      });

    if (providerError) {
      console.error(
        '[WhatsApp API] Provider database error:',
        providerError
      );

      return NextResponse.json(
        {
          success: false,
          reply:
            'Sorry, I am temporarily unavailable. Please try again shortly.',
          error: providerError.message,
        },
        { status: 500 }
      );
    }

    if (!providerRows?.length) {
      console.error(
        '[WhatsApp API] No AI providers enabled.'
      );

      return NextResponse.json(
        {
          success: false,
          reply:
            'Sorry, I am temporarily unavailable. Please try again shortly.',
          error:
            'No AI providers are enabled',
        },
        { status: 503 }
      );
    }

    const providerConfigs: ProviderConfig[] =
      providerRows.map((row) => ({
        provider: row.provider,
        apiKey:
          row.api_key_encrypted || undefined,
        apiUrl:
          row.base_url || undefined,
        model: row.model,

        /*
        Your ai_provider_configs table does NOT
        contain temperature or max_tokens.
        */

        temperature: 0.7,
        maxTokens: 1024,
      }));

    console.log(
      '[WhatsApp API] Enabled providers:',
      providerRows.map((provider) => ({
        provider: provider.provider,
        model: provider.model,
        priority: provider.priority,
      }))
    );

    /*
    |--------------------------------------------------------------------------
    | 15. Build business-specific knowledge context
    |--------------------------------------------------------------------------
    */

    const knowledgeContext =
      knowledgeItems?.length
        ? knowledgeItems
            .map(
              (item) =>
                `Title: ${item.title}
Category: ${item.category}
Content: ${item.content}
Tags: ${(item.tags || []).join(', ')}`
            )
            .join('\n\n---\n\n')
        : 'No additional business knowledge has been added yet.';

    const productsContext =
      products?.length
        ? products
            .map(
              (product) =>
                `Product: ${product.name}
Description: ${
                  product.description ||
                  'No description provided'
                }
Exact Price: ${product.price != null ? `${product.price} ${product.currency || ''}` : 'Not provided'}
Availability: ${product.availability || 'Not provided'}`
            )
            .join('\n\n')
        : 'No products have been added yet.';
    const subscriptionPlansContext =
      subscriptionPlans?.length
        ? subscriptionPlans
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
              return `Plan: ${plan.name}
Description: ${plan.description || 'Not provided'}
Exact ${plan.billing_period || 'monthly'} Price: ${currentPrice}
Exact Yearly Price: ${yearlyPrice}
Features: ${features}`;
            })
            .join('\n\n---\n\n')
        : 'No subscription plans are available.';

    /*
    |--------------------------------------------------------------------------
    | 16. Build BUSINESS-specific system prompt
    |--------------------------------------------------------------------------
    */

    const systemPrompt = `
You are the official WhatsApp assistant for ${business.name}.

You represent THIS business only.

BUSINESS INFORMATION:

Business Name:
${business.name}

Industry:
${business.industry || 'Not specified'}

Business Description:
${business.description || 'Not specified'}

Website:
${business.website || 'Not provided'}

Business Phone:
${business.phone || 'Not provided'}

Business Address:
${business.address || 'Not provided'}

AGENT INFORMATION:

Agent Name:
${agent?.name || `${business.name} Assistant`}

Agent Purpose:
${agent?.purpose || 'Help customers and answer business questions'}

Agent Description:
${agent?.description || 'Not provided'}

Communication Style:
${agent?.communication_style || 'Professional'}

Primary Goal:
${agent?.primary_goal || 'Help customers effectively'}

AGENT SETTINGS:

Tone:
${agentSettings?.tone || 'professional'}

Response Language:
${agentSettings?.response_language || 'English'}

Greeting Behavior:
${agentSettings?.greeting_behavior || 'Natural'}

Custom Instructions:
${agentSettings?.custom_instructions || 'None'}

BUSINESS PRODUCTS:

${productsContext}

BUSINESS KNOWLEDGE:

${knowledgeContext}

LIVE SUBSCRIPTION PLANS AND PRICING:

${subscriptionPlansContext}

AGENTHUB PLATFORM CAPABILITIES (AUTHORITATIVE FOR AGENTHUB PRODUCT QUESTIONS):

If the customer is asking about AgentHub AI / the AgentHub platform itself, these capabilities are available:
- AI website chat widget
- WhatsApp AI agent
- WhatsApp QR-code connection
- WhatsApp Cloud API connection
- Text replies
- Voice replies
- Dashboard-selectable reply rules: text only, voice only, text and voice, or random text/voice
- Roman Urdu support
- Urdu-script voice transcript generation for better Urdu pronunciation
- Knowledge base
- Products and pricing
- Lead management
- Conversation management
- Follow-ups
- Appointment handling
- Multiple AI provider configuration and fallback
- Gemini, Groq and Ollama provider support when configured
- WhatsApp group reply rules
- Dashboard-based integration and agent management

CRITICAL CAPABILITY RULE:
- Do NOT say that AgentHub does not support voice replies, voice messages, text-and-voice replies, Roman Urdu, or dashboard reply-mode selection.
- These features are available.
- If a customer asks whether AgentHub supports one of the listed capabilities, answer directly that it is supported and explain how it works in simple customer-facing language.
- Never contradict this authoritative capability list because the feature was not mentioned in a generic knowledge-base entry.
- Only say a feature is unavailable when it is explicitly outside this capability list and not present in the business knowledge.

IMPORTANT RULES:

- You are communicating directly with a customer of ${business.name}.
- Represent ${business.name}, not AgentHub AI.
- Never introduce yourself as AgentHub AI.
- Never say "AgentHub received your message".
- Never mention internal systems.
- Never mention APIs.
- Never mention AI providers.
- Never mention Gemini, Groq, or Ollama.
- Never mention databases.
- Never mention technical implementation.
- Answer according to the information of ${business.name}.
- Only use products belonging to ${business.name}.
- Only use knowledge belonging to ${business.name}.
- Do not invent products, prices, services, policies or business information.
- When the customer asks for a price, pricing, cost, rate, plans, package, subscription, or quotation, first use the exact prices in BUSINESS PRODUCTS or LIVE SUBSCRIPTION PLANS above.
- If an exact price is available in the context, state it clearly and directly. Do NOT tell the customer to contact sales or a team for pricing that is already available.
- Never guess or invent a missing price.
- Only say pricing is unavailable when the requested item genuinely has no price in the provided context.
- For AgentHub plan questions, LIVE SUBSCRIPTION PLANS is the source of truth.
- If information is unavailable, politely say that you do not have that information yet.
- Be helpful, professional and natural.
- LANGUAGE BEHAVIOR: Automatically match the customer's language.
- If the customer writes in Roman Urdu (Urdu written using English/Latin letters, for example "aap kya offer karte hain", "price kya hai", "mujhe details chahiye"), reply in natural Roman Urdu using Latin/English letters.
- Do NOT translate Roman Urdu into Urdu Arabic script unless the customer specifically uses or requests Urdu script.
- If the customer writes in Urdu script, reply in Urdu script unless they ask for another language.
- If the customer writes in English, reply in English.
- If the customer mixes English business terms with Roman Urdu, naturally keep common terms such as WhatsApp, AI, plan, price and website while the surrounding response remains Roman Urdu.
- Customer language takes priority over the default Response Language setting for the current conversation.
- Do not say that you are switching languages; just respond naturally in the customer's language.
- Keep replies suitable for WhatsApp.
- Use short paragraphs.
- Use bullet points only when useful.
- Do not use unnecessary long explanations.
- Do not claim that an action was completed unless it actually happened.

Conversation behavior:
- Match the customer's energy and pace. A short reply from them ("ok",
  "cool", "wonderful") does not need a long response back - a brief,
  warm acknowledgement is enough, optionally with ONE natural next
  question if it moves things forward.
- Never repeat information you already gave earlier in this
  conversation unless the customer asks again or seems confused.
- Do not re-introduce yourself or restate your full pitch more than
  once per conversation. If they've already heard it, build on it
  instead of repeating it.
- If the customer goes quiet on a specific question, gently follow up
  once - do not ask the same question over and over.
- If the customer sounds frustrated, confused, or explicitly asks for
  a human, acknowledge that plainly and let them know a team member
  will follow up, rather than continuing to push the sales pitch.
- Stay in character as a single consistent assistant for this
  business throughout the whole conversation - never sound like you
  forgot the earlier messages or are starting over.
- You are shown the recent message history below, oldest first, ending with
  the customer's latest message. Use it to understand what "it", "that",
  short replies like "yes"/"ok"/"wonderful", and any other references are
  actually about. Never restart with a generic greeting if the conversation
  is already underway - only greet like it's a first message when the
  history is genuinely empty or the customer greeted you first.
    `.trim();

    /*
    |--------------------------------------------------------------------------
    | 17. Generate AI response with fallback
    |--------------------------------------------------------------------------
    |
    | Gemini
    |    ↓ fails
    | Groq
    |    ↓ fails
    | Ollama
    |
    */

    console.log(
      '[WhatsApp API] Sending message to AI...'
    );

    const aiResponse =
      await generateAIResponseWithFallback(
        {
          messages: conversationHistory,

          systemPrompt,

          temperature: 0.7,

          maxTokens: 1024,

          businessId,
        },
        providerConfigs
      );

    /*
    |--------------------------------------------------------------------------
    | 18. AI failure
    |--------------------------------------------------------------------------
    */

    if (
      aiResponse.error ||
      !aiResponse.content?.trim()
    ) {
      console.error(
        '[WhatsApp API] All AI providers failed:',
        aiResponse.error
      );

      return NextResponse.json(
        {
          success: false,
          reply:
            'Sorry, I am temporarily unable to process your message. Please try again in a moment.',
          error:
            aiResponse.error ||
            'AI returned an empty response',
        },
        { status: 503 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 19. Apply business response length
    |--------------------------------------------------------------------------
    */

    // WhatsApp supports messages far longer than a normal AI response.
    // Do not silently cut private replies at the agent dashboard's
    // max_response_length value; that setting previously caused replies
    // to end in the middle of a word and made the remaining AI response
    // disappear. Keep the complete generated answer.
    let finalReply = aiResponse.content.trim();

    /*
    |--------------------------------------------------------------------------
    | 19a. Hard capability guard for AgentHub voice questions
    |--------------------------------------------------------------------------
    |
    | Voice support is implemented by the connected WhatsApp service. Do not
    | allow an AI hallucination to tell a customer that this shipped feature is
    | unavailable.
    |
    */
    const normalizedCustomerMessage = String(message || '').toLowerCase();
    const asksAboutVoiceFeature =
      /\b(voice|audio|voice note|voice reply|voice message|text and voice|text voice)\b/i.test(normalizedCustomerMessage) &&
      /\b(support|available|feature|reply|replies|message|messages|kar|karta|hota|hai|hain|can|does|do)\b/i.test(normalizedCustomerMessage);

    const replyDeniesVoiceFeature =
      /\b(not available|unavailable|don't have|do not have|doesn't have|not support|doesn't support|cannot support|no voice|feature.*not)\b/i.test(finalReply);

    if (asksAboutVoiceFeature && replyDeniesVoiceFeature) {
      finalReply =
        /\b(aap|ap|kya|hai|hain|kar|karta|roman|urdu)\b/i.test(message)
          ? 'Ji haan, AgentHub WhatsApp AI mein voice replies available hain. Dashboard se aap Text only, Voice only, Text and Voice, ya Random reply mode select kar sakte hain.'
          : 'Yes, AgentHub WhatsApp AI supports voice replies. From the dashboard you can choose Text only, Voice only, Text and Voice, or Random reply mode.';
      console.warn('[WhatsApp API] Replaced incorrect voice-feature denial with authoritative capability response');
    }

    /*
    |--------------------------------------------------------------------------
    | 19b. Generate a separate natural voice transcript
    |--------------------------------------------------------------------------
    |
    | WhatsApp text should match the customer's Roman Urdu, but Urdu neural
    | voices pronounce Roman Urdu as English and misread many words. Create a
    | voice-only companion in Urdu script without changing the visible text.
    |
    */
    let voiceReply = finalReply;

    const looksLikeRomanUrdu =
      /\b(aap|ap|hai|hain|kya|kaise|mujhe|hum|ham|yeh|ye|kar|karen|chahiye|plan|price|features?|offer|detail)\b/i.test(finalReply) &&
      !/[\u0600-\u06FF]/.test(finalReply);

    if (looksLikeRomanUrdu) {
      try {
        const voiceTranscriptResponse = await generateAIResponseWithFallback(
          {
            messages: [
              {
                role: 'user',
                content: finalReply,
              },
            ],
            systemPrompt: `Rewrite the following WhatsApp reply as a highly natural SPOKEN Pakistani Urdu script for text-to-speech.

STRICT RULES:
- Preserve exactly the same meaning and business facts.
- Do not add, remove, invent, summarize, or change information.
- Output ONLY the final Urdu-script speech text. No explanation.
- Write for a Pakistani female voice speaking naturally in a WhatsApp conversation.
- Use short natural sentences and natural punctuation: commas for small pauses and full stops for complete pauses.
- Avoid overly formal or literary Urdu.
- Do NOT translate common technology and brand terms literally. Write them phonetically in Urdu when that improves pronunciation.
- Examples of spoken phonetic forms when appropriate:
  WhatsApp → واٹس ایپ
  AgentHub → ایجنٹ ہب
  AI → اے آئی
  dashboard → ڈیش بورڈ
  voice reply → وائس رِپلائی
  voice note → وائس نوٹ
  text → ٹیکسٹ
  plan → پلان
  price → پرائس
  feature → فیچر
  QR code → کیو آر کوڈ
- Keep URLs, phone numbers, prices and codes unchanged unless pronunciation would clearly improve by spacing them naturally.
- Never use Roman Urdu or English words inside normal sentences when an Urdu phonetic form would sound better.
- This is speech, not a written translation. Make it sound conversational and smooth.
- The output will be spoken by a Pakistani female neural voice, so optimize pronunciation and rhythm.`,
            temperature: 0.2,
            maxTokens: 1024,
            businessId,
          },
          providerConfigs
        );

        if (voiceTranscriptResponse.content?.trim()) {
          voiceReply = voiceTranscriptResponse.content.trim();
          console.log('[WhatsApp API] Generated Urdu-script voice transcript');
        }
      } catch (voiceTranscriptError) {
        console.error(
          '[WhatsApp API] Voice transcript generation failed; using visible reply:',
          voiceTranscriptError
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 20. Save AI response
    |--------------------------------------------------------------------------
    */

    const {
      error: outgoingMessageError,
    } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: agent?.id || null,
        content: finalReply,
        content_type: 'text',
        metadata: {
          channel: 'whatsapp',
          provider: aiResponse.provider,
          model: aiResponse.model,
        },
      });

    if (outgoingMessageError) {
      console.error(
        '[WhatsApp API] AI message save error:',
        outgoingMessageError
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 21. Update conversation timestamp
    |--------------------------------------------------------------------------
    */

    await supabase
      .from('conversations')
      .update({
        last_message_at:
          new Date().toISOString(),
      })
      .eq('id', conversation.id);

    /*
    |--------------------------------------------------------------------------
    | 21b. Appointment detection
    |--------------------------------------------------------------------------
    |
    | Controlled by agent_settings.appointments_enabled - previously
    | fetched but, like auto_followups_enabled, never actually used.
    |
    | Only creates an appointment when the customer clearly agreed to a
    | specific date AND time (see lib/appointments.ts for the exact
    | bar) - ambiguous mentions are ignored rather than guessed at.
    |
    */

    let bookedAppointmentId: string | null = null;

    if (agentSettings?.appointments_enabled === true) {
      const detected = await detectAppointmentRequest(
        message,
        finalReply,
        business.address || '',
        providerConfigs
      );

      if (detected) {
        const { data: newAppointment, error: appointmentError } =
          await supabase
            .from('appointments')
            .insert({
              business_id: businessId,
              customer_id: customer.id,
              lead_id: lead?.id || null,
              customer_name: customer.name || phone || 'WhatsApp Customer',
              date: detected.date,
              start_time: detected.startTime,
              end_time: detected.endTime,
              status: 'scheduled',
              notes: detected.notes,
            })
            .select()
            .single();

        if (appointmentError) {
          console.error(
            '[WhatsApp API] Appointment creation error:',
            appointmentError
          );
        } else {
          bookedAppointmentId = newAppointment.id;

          console.log(
            '[WhatsApp API] Appointment booked:',
            newAppointment.id,
            detected.date,
            detected.startTime
          );

          if (lead) {
            await supabase
              .from('leads')
              .update({ status: 'appointment_booked' })
              .eq('id', lead.id);
          }

          // Cancel any pending "lead gone quiet" auto follow-up - they
          // just booked, a check-in message right now would be noise.
          if (lead) {
            await supabase
              .from('follow_up_tasks')
              .update({ status: 'cancelled' })
              .eq('business_id', businessId)
              .eq('lead_id', lead.id)
              .eq('status', 'pending')
              .eq('notes', 'auto:lead-checkin');
          }

          // Schedule a reminder task 1 hour before the appointment.
          const appointmentDateTime = new Date(
            `${detected.date}T${detected.startTime}:00`
          );
          const reminderAt = new Date(
            appointmentDateTime.getTime() - 60 * 60 * 1000
          );

          if (reminderAt.getTime() > Date.now()) {
            await supabase.from('follow_up_tasks').insert({
              business_id: businessId,
              lead_id: lead?.id || null,
              appointment_id: newAppointment.id,
              task_type: 'meeting',
              scheduled_at: reminderAt.toISOString(),
              status: 'pending',
              notes: 'auto:appointment-reminder',
            });
          }
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    console.log('-----------------------------------');
    console.log(
      '[WhatsApp API] Reply generated successfully'
    );
    console.log(
      '[WhatsApp API] Business:',
      business.name
    );
    console.log(
      '[WhatsApp API] Customer:',
      customer.id
    );
    console.log(
      '[WhatsApp API] Conversation:',
      conversation.id
    );
    console.log(
      '[WhatsApp API] Lead:',
      lead?.id || 'Not created'
    );
    console.log(
      '[WhatsApp API] Provider:',
      aiResponse.provider
    );
    console.log(
      '[WhatsApp API] Model:',
      aiResponse.model
    );
    console.log('-----------------------------------');

    return NextResponse.json({
      success: true,
      reply: finalReply,
      voice_reply: voiceReply,
      voice_reply_mode: voiceReplyMode,
      provider: aiResponse.provider,
      model: aiResponse.model,
      appointment_id: bookedAppointmentId,
      business: {
        id: business.id,
        name: business.name,
      },
      customer_id: customer.id,
      conversation_id: conversation.id,
      lead_id: lead?.id || null,
    });
  } catch (error) {
    console.error(
      '[WhatsApp API] Unexpected error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        reply:
          'Sorry, something went wrong while processing your message.',
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}