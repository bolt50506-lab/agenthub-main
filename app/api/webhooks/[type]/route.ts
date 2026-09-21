import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';

type Channel = 'facebook_messenger' | 'instagram';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function channelForType(type: string): Channel | null {
  return type === 'facebook_messenger' || type === 'instagram' ? type : null;
}

function cleanReply(text: string, maxLength = 3500) {
  const cleaned = String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^(analysis|reasoning|draft|final answer)\s*:\s*/i, '')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const candidate = cleaned.slice(0, maxLength);
  const end = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '), candidate.lastIndexOf('\n'));
  return (end >= Math.floor(maxLength * 0.65) ? candidate.slice(0, end + 1) : candidate.slice(0, candidate.lastIndexOf(' '))).trimEnd() + '…';
}

async function callGemini(systemPrompt: string, userText: string, history: Array<{ role: string; text: string }>) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const contents = [
    ...history.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userText }] },
  ];
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { temperature: 0.35, maxOutputTokens: 1800 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + JSON.stringify(data).slice(0, 600));
  const text = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => p?.text && p?.thought !== true).map((p: any) => p.text).join('').trim();
  if (!text) throw new Error('Gemini returned no final text');
  return text;
}

async function callGrok(systemPrompt: string, userText: string, history: Array<{ role: string; text: string }>) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY is not configured');
  const model = process.env.XAI_MODEL || 'grok-4.6';
  const input = [{ role: 'system', content: systemPrompt }, ...history.slice(-12).map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: userText }];
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, input, temperature: 0.4, max_output_tokens: 1800 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('xAI ' + res.status + ': ' + JSON.stringify(data).slice(0, 600));
  const text = data?.output_text || data?.output?.flatMap((item: any) => item?.content || []).map((part: any) => part?.text || '').join('').trim();
  if (!text) throw new Error('Grok returned no text');
  return text;
}

async function generateReply(systemPrompt: string, userText: string, history: Array<{ role: string; text: string }>) {
  try { return { reply: await callGemini(systemPrompt, userText, history), provider: 'gemini' }; }
  catch (first) {
    console.error('Social Gemini failed; trying Grok:', String(first));
    try { return { reply: await callGrok(systemPrompt, userText, history), provider: 'grok' }; }
    catch (second) { throw new Error('Both AI providers failed. Gemini: ' + String(first) + ' | Grok: ' + String(second)); }
  }
}

async function knowledge(businessId: string, question: string, supabase: any) {
  const [k, p, s, plans] = await Promise.all([
    supabase.from('knowledge_items').select('title,category,content,tags').eq('business_id', businessId).eq('status', 'active').order('updated_at', { ascending: false }).limit(20),
    supabase.from('products').select('name,description,price,currency,availability,status,sku').eq('business_id', businessId).eq('status', 'active').limit(50),
    supabase.from('services').select('name,description,price,currency,duration_minutes,advance_required,status').eq('business_id', businessId).eq('status', 'active').limit(50),
    supabase.from('subscription_plans').select('name,slug,price_cents,yearly_price_cents,currency,description,features').eq('is_active', true).order('sort_order', { ascending: true }),
  ]);
  return [
    'BUSINESS KNOWLEDGE — source of truth. Never invent information not present here.',
    (k.data || []).map((x: any) => '[KB] ' + x.title + '\n' + x.content).join('\n\n') || 'No knowledge-base entries.',
    (p.data || []).map((x: any) => '[PRODUCT] ' + x.name + ' | ' + (x.price ?? 'Price not set') + ' ' + (x.currency || '') + '\n' + (x.description || '')).join('\n\n') || 'No products.',
    (s.data || []).map((x: any) => '[SERVICE] ' + x.name + ' | ' + (x.price ?? 'Price not set') + ' ' + (x.currency || '') + '\n' + (x.description || '')).join('\n\n') || 'No services.',
    (plans.data || []).map((x: any) => '[PLAN] ' + x.name + ' | monthly ' + ((x.price_cents || 0) / 100).toFixed(2) + ' ' + (x.currency || '') + ' | yearly ' + (x.yearly_price_cents ? ((x.yearly_price_cents || 0) / 100).toFixed(2) : 'not set') + ' ' + (x.currency || '') + '\n' + (x.description || '') + '\nFeatures: ' + ((x.features || []).join(', '))).join('\n\n') || 'No subscription plans.',
    'CUSTOMER QUESTION:\n' + question,
  ].join('\n\n');
}

async function sendMeta(channel: Channel, cfg: Record<string, any>, recipient: string, body: string) {
  const token = String(channel === 'facebook_messenger' ? cfg.page_access_token : cfg.access_token || '');
  if (!token) throw new Error('Meta access token is missing');
  let url: string;
  let payload: any;
  if (channel === 'facebook_messenger') {
    const pageId = String(cfg.page_id || '');
    if (!pageId) throw new Error('Facebook Page ID is missing');
    url = 'https://graph.facebook.com/' + META_VERSION + '/me/messages';
    payload = { recipient: { id: recipient }, messaging_type: 'RESPONSE', message: { text: body } };
  } else {
    const igId = String(cfg.instagram_account_id || '');
    if (!igId) throw new Error('Instagram Account ID is missing');
    // Instagram Login uses graph.instagram.com and the Instagram
    // user access token generated by the Instagram API setup.
    url = 'https://graph.instagram.com/' + META_VERSION + '/me/messages';
    payload = { recipient: { id: recipient }, message: { text: body } };
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error('Meta send failed: ' + (data?.error?.message || JSON.stringify(data).slice(0, 700)));
  return data;
}

async function processWebhook(type: Channel, body: any) {
  const supabase = createServiceClient();
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  const events = entries.flatMap((entry: any) => {
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    if (messaging.length) {
      return messaging.map((event: any) => ({
        entryId: String(entry?.id || ''),
        senderId: String(event?.sender?.id || event?.from?.id || ''),
        recipientId: String(event?.recipient?.id || entry?.id || ''),
        messageId: String(event?.message?.mid || event?.message?.id || event?.id || ''),
        text: String(event?.message?.text || event?.message?.text?.body || event?.text?.body || '').trim(),
        message: event?.message || event,
      }));
    }

    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return changes.flatMap((change: any) => {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      return messages.map((message: any) => ({
        entryId: String(entry?.id || ''),
        senderId: String(message?.from?.id || ''),
        recipientId: String(value?.recipient?.id || entry?.id || ''),
        messageId: String(message?.id || ''),
        text: String(message?.text?.body || message?.text || '').trim(),
        message,
      }));
    });
  });

  if (!events.length) {
    console.warn('Meta social webhook received no messaging events', {
      type,
      object: body?.object,
      entryCount: entries.length,
    });
    return;
  }

  const integrationField = type === 'facebook_messenger' ? 'page_id' : 'instagram_account_id';

  for (const inbound of events) {
    if (inbound.message?.is_echo || inbound.message?.app_id) continue;

    const candidateIds = [inbound.recipientId, inbound.entryId].filter(Boolean);
    let integration: any = null;

    for (const candidateId of candidateIds) {
      const { data } = await supabase
        .from('integrations')
        .select('id,business_id,config,status')
        .eq('type', type)
        .eq('status', 'connected')
        .filter('config->>' + integrationField, 'eq', candidateId)
        .limit(1)
        .maybeSingle();

      if (data) {
        integration = data;
        break;
      }
    }

    if (!integration) {
      console.warn('No connected ' + type + ' integration for webhook IDs', candidateIds);
      continue;
    }

    const cfg = (integration.config || {}) as Record<string, any>;
    const businessId = integration.business_id;
    const sender = inbound.senderId;
    const text = inbound.text;
    const messageId = inbound.messageId;

    if (!sender || !text) {
      console.warn('Ignoring Meta event without sender/text', {
        type,
        sender,
        messageId,
        hasMessage: Boolean(inbound.message),
      });
      continue;
    }

    const externalId = type + ':' + sender;
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id,agent_id,customer_id,ai_enabled,human_takeover,status')
      .eq('business_id', businessId)
      .eq('external_id', externalId)
      .limit(1)
      .maybeSingle();

    const { data: agent } = await supabase
      .from('agents')
      .select('id,name,communication_style,primary_goal,description,status')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .eq('name', 'Ayesha')
      .limit(1)
      .maybeSingle();

    const selectedAgent = agent || (await supabase
      .from('agents')
      .select('id,name,communication_style,primary_goal,description,status')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()).data;

    const { data: settings } = await supabase
      .from('agent_settings')
      .select('tone,auto_create_leads,custom_instructions,response_language')
      .eq('business_id', businessId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      const created = await supabase.from('conversations').insert({
        business_id: businessId,
        agent_id: selectedAgent?.id || null,
        type: 'customer',
        title: (type === 'instagram' ? 'Instagram ' : 'Facebook ') + sender,
        external_id: externalId,
        channel: type,
        ai_enabled: true,
        status: 'active',
        human_takeover: false,
      }).select('id,agent_id,customer_id,ai_enabled,human_takeover,status').single();

      if (created.error) {
        console.error('Social conversation creation failed:', created.error.message);
        continue;
      }
      conversation = created.data;
    }

    let { data: customer } = await supabase
      .from('customers')
      .select('id,name,phone')
      .eq('business_id', businessId)
      .eq('external_id', externalId)
      .limit(1)
      .maybeSingle();

    if (!customer) {
      const createdCustomer = await supabase.from('customers').insert({
        business_id: businessId,
        name: (type === 'instagram' ? 'Instagram ' : 'Facebook ') + sender,
        external_id: externalId,
        metadata: { channel: type, provider_id: sender },
      }).select('id,name,phone').single();
      customer = createdCustomer.data;
    }

    if (customer?.id && !conversation.customer_id) {
      await supabase.from('conversations').update({ customer_id: customer.id }).eq('id', conversation.id);
    }

    if (messageId) {
      const { data: dup } = await supabase
        .from('messages')
        .select('id')
        .eq('business_id', businessId)
        .filter('metadata->>provider_message_id', 'eq', messageId)
        .limit(1)
        .maybeSingle();
      if (dup) continue;
    }

    await supabase.from('messages').insert({
      business_id: businessId,
      conversation_id: conversation.id,
      sender_type: 'customer',
      content: text,
      content_type: 'text',
      metadata: { provider_message_id: messageId, provider: type, sender_id: sender },
      is_inbound: true,
    });

    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    if (settings?.auto_create_leads !== false) {
      const { data: lead } = await supabase.from('leads')
        .select('id')
        .eq('business_id', businessId)
        .eq('phone', sender)
        .neq('status', 'converted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lead) {
        await supabase.from('leads').insert({
          business_id: businessId,
          customer_id: customer?.id || null,
          conversation_id: conversation.id,
          name: (type === 'instagram' ? 'Instagram ' : 'Facebook ') + sender,
          phone: sender,
          source: type,
          requirement: text.slice(0, 1000),
          status: 'new',
        });
      }
    }

    if (conversation.human_takeover || conversation.ai_enabled === false) continue;

    const { data: prior } = await supabase.from('messages')
      .select('content,is_inbound')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(12);

    const history = (prior || []).reverse().map((m: any) => ({
      role: m.is_inbound ? 'user' : 'assistant',
      text: m.content,
    }));

    const prompt =
      'You are the AI assistant for this business. Never introduce yourself by name. Answer directly. Reply naturally in English or Roman Urdu based on the customer. Never mention internal agents, providers, APIs, databases or workflow labels. Never invent prices, policies, bookings, payments, discounts or guarantees. Keep replies concise and complete. Tone: ' +
      (settings?.tone || selectedAgent?.communication_style || 'friendly-professional') +
      '. Instructions: ' +
      (settings?.custom_instructions || 'Reply naturally, accurately and helpfully') +
      '\n\n' +
      await knowledge(businessId, text, supabase);

    const generated = await generateReply(prompt, text, history);
    const reply = cleanReply(generated.reply);

    await sendMeta(type, cfg, sender, reply);

    await supabase.from('messages').insert({
      business_id: businessId,
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_id: selectedAgent?.id || null,
      content: reply,
      content_type: 'text',
      metadata: { provider: type, ai_provider: generated.provider, recipient_id: sender },
      is_inbound: false,
    });

    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);
  }
}

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const type = channelForType(params.type);
  if (!type) return json({ error: 'Unsupported Meta channel' }, 404);
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge) return json({ error: 'Invalid verification request' }, 403);
  const supabase = createServiceClient();
  const { data } = await supabase.from('integrations').select('id').eq('type', type).filter('config->>verify_token', 'eq', token).limit(1).maybeSingle();
  return data ? new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } }) : json({ error: 'Invalid verify token' }, 403);
}

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const type = channelForType(params.type);
  if (!type) return json({ error: 'Unsupported Meta channel' }, 404);
  try {
    const body = await req.json();
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const eventCount = entries.reduce((count: number, entry: any) => {
      const messaging = Array.isArray(entry?.messaging) ? entry.messaging.length : 0;
      const changes = Array.isArray(entry?.changes) ? entry.changes.reduce((n: number, change: any) => n + (Array.isArray(change?.value?.messages) ? change.value.messages.length : 0), 0) : 0;
      return count + messaging + changes;
    }, 0);
    const payloadKeys = Object.keys(body || {}).slice(0, 20);
    const { error: debugError } = await createServiceClient().from('webhook_debug_events').insert({
      channel: type,
      object_type: typeof body?.object === 'string' ? body.object : null,
      entry_count: entries.length,
      event_count: eventCount,
      payload_keys: payloadKeys,
    });
    if (debugError) console.error('Webhook diagnostic insert failed:', debugError.message);
    await processWebhook(type, body);
    return json({ ok: true });
  } catch (error) {
    console.error('Meta social webhook failed:', error);
    return json({ ok: true });
  }
}
