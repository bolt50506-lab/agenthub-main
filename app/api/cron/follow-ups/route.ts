import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  generateAIResponseWithFallback,
  type ProviderConfig,
} from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

/*
|--------------------------------------------------------------------------
| POST /api/cron/follow-ups
|--------------------------------------------------------------------------
|
| Processes every due follow_up_tasks row (status = 'pending' AND
| scheduled_at <= now) and actually sends the follow-up message over
| WhatsApp. This route does the sending - creating/scheduling the task
| itself happens inline in the message webhooks (see
| app/api/whatsapp/incoming/route.ts).
|
| This is meant to be called periodically by something outside a normal
| request/response cycle - either your WhatsApp service's built-in
| interval (see server.js), or a real cron trigger if you deploy
| somewhere that supports one (e.g. Vercel Cron hitting this same URL).
|
| Protected by a shared secret - never runs without it.
|
*/

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.FOLLOWUP_CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const whatsappServiceUrl = process.env.WHATSAPP_QR_SERVICE_URL || 'http://localhost:3001';

  const nowIso = new Date().toISOString();

  const { data: dueTasks, error: dueTasksError } = await supabase
    .from('follow_up_tasks')
    .select('id, business_id, lead_id, appointment_id, task_type, notes, scheduled_at')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (dueTasksError) {
    console.error('[FollowUp Cron] Failed to load due tasks:', dueTasksError);
    return NextResponse.json({ error: dueTasksError.message }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const task of dueTasks || []) {
    try {
      if (!task.lead_id) {
        // Manual/custom follow-ups with no linked lead aren't something
        // this automated sender can act on - leave them for a human.
        continue;
      }

      const { data: lead } = await supabase
        .from('leads')
        .select('id, name, customer_id, status')
        .eq('id', task.lead_id)
        .maybeSingle();

      if (!lead?.customer_id) {
        console.error('[FollowUp Cron] Task has no resolvable customer:', task.id);
        continue;
      }

      // Leads that already converted shouldn't get a generic "checking
      // in" nudge.
      if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'appointment_booked') {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('id', task.id);
        continue;
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, name, phone, external_id')
        .eq('id', lead.customer_id)
        .maybeSingle();

      if (!customer?.external_id) {
        console.error('[FollowUp Cron] Customer has no WhatsApp identity:', lead.customer_id);
        continue;
      }

      const { data: whatsappSession } = await supabase
        .from('whatsapp_sessions')
        .select('session_id, status')
        .eq('business_id', task.business_id)
        .eq('connection_method', 'qr_code')
        .maybeSingle();

      if (!whatsappSession?.session_id || whatsappSession.status !== 'connected') {
        console.error('[FollowUp Cron] No connected WhatsApp session for business:', task.business_id);
        continue;
      }

      const { data: business } = await supabase
        .from('businesses')
        .select('id, name, industry')
        .eq('id', task.business_id)
        .maybeSingle();

      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, communication_style')
        .eq('business_id', task.business_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      const { data: providerRows } = await supabase
        .from('ai_provider_configs')
        .select('provider, model, base_url, api_key_encrypted, priority')
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      let messageText: string;

      if (task.notes === 'auto:appointment-reminder') {
        const { data: appointment } = task.appointment_id
          ? await supabase
              .from('appointments')
              .select('date, start_time')
              .eq('id', task.appointment_id)
              .maybeSingle()
          : { data: null };

        messageText = appointment
          ? `Hi${customer.name ? ' ' + customer.name : ''}! Just a reminder about your appointment with ${business?.name || 'us'} on ${appointment.date} at ${appointment.start_time}. See you then!`
          : `Hi${customer.name ? ' ' + customer.name : ''}! Just a reminder about your upcoming appointment with ${business?.name || 'us'}.`;
      } else if (providerRows?.length && business) {
        // "auto:lead-checkin" and any other message-type follow-up: let
        // the AI write a short, natural check-in in the business's
        // voice instead of a generic canned line.
        const providerConfigs: ProviderConfig[] = providerRows.map((row) => ({
          provider: row.provider,
          apiKey: row.api_key_encrypted || undefined,
          apiUrl: row.base_url || undefined,
          model: row.model,
          temperature: 0.7,
          maxTokens: 200,
        }));

        const response = await generateAIResponseWithFallback(
          {
            messages: [
              {
                role: 'user',
                content: `Write a brief, friendly WhatsApp follow-up message checking in with a lead named ${customer.name || 'there'} who reached out to ${business.name} but hasn't responded in a day. One or two sentences, no signature, no placeholders.`,
              },
            ],
            systemPrompt: `You write short follow-up messages for ${business.name} (${business.industry || 'a business'}), in a ${agent?.communication_style || 'friendly, professional'} tone. Never mention that you are an AI or that this is automated.`,
            temperature: 0.7,
            maxTokens: 200,
          },
          providerConfigs
        );

        messageText =
          response.content?.trim() ||
          `Hi${customer.name ? ' ' + customer.name : ''}, just checking in - is there anything else I can help you with?`;
      } else {
        messageText = `Hi${customer.name ? ' ' + customer.name : ''}, just checking in - is there anything else I can help you with?`;
      }

      const sendRes = await fetch(`${whatsappServiceUrl}/sessions/${whatsappSession.session_id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: customer.external_id, message: messageText }),
      });

      if (!sendRes.ok) {
        const body = await sendRes.text().catch(() => '');
        console.error('[FollowUp Cron] Send failed for task', task.id, sendRes.status, body.slice(0, 300));
        failed++;
        continue;
      }

      await supabase.from('follow_up_tasks').update({ status: 'completed' }).eq('id', task.id);

      await supabase.from('follow_up_history').insert({
        follow_up_id: task.id,
        business_id: task.business_id,
        action: 'completed',
        notes: 'Sent automatically',
      });

      // Record it in the conversation for continuity, if one exists.
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('business_id', task.business_id)
        .eq('customer_id', lead.customer_id)
        .eq('channel', 'whatsapp')
        .maybeSingle();

      if (conversation) {
        await supabase.from('messages').insert({
          business_id: task.business_id,
          conversation_id: conversation.id,
          sender_type: 'agent',
          content: messageText,
          content_type: 'text',
          metadata: { channel: 'whatsapp', source: 'auto_followup' },
        });

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);
      }

      processed++;
      console.log('[FollowUp Cron] Sent follow-up', task.id, '->', customer.external_id);
    } catch (error) {
      failed++;
      console.error('[FollowUp Cron] Error processing task', task.id, error);
    }
  }

  return NextResponse.json({ processed, failed, checked: dueTasks?.length || 0 });
}
