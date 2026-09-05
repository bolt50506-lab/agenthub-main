import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const RAILWAY_WORKER_SERVICE_ID = 'dc07c2e6-cdb5-4971-99d3-6e6f6f2f5cc8';
const PROCESSING_STALE_MS = 15 * 60 * 1000;

function authorized(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const followupSecret = process.env.FOLLOWUP_CRON_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const webhookSecret = process.env.AGENTHUB_WEBHOOK_SECRET;

  const matchedSecret =
    (Boolean(followupSecret) && token === followupSecret && 'FOLLOWUP_CRON_SECRET') ||
    (Boolean(cronSecret) && token === cronSecret && 'CRON_SECRET') ||
    (Boolean(webhookSecret) && token === webhookSecret && 'AGENTHUB_WEBHOOK_SECRET');

  const workerHeader = req.headers.get('x-agenthub-worker') || '';
  const workerServiceId = req.headers.get('x-railway-service-id') || '';
  const matchedRailwayWorker =
    workerHeader === 'railway-followup-v1' &&
    workerServiceId === RAILWAY_WORKER_SERVICE_ID;

  if (!matchedSecret && !matchedRailwayWorker) {
    console.warn('[FollowUp Cron] Authorization rejected', {
      hasAuthorizationHeader: Boolean(header),
      tokenPresent: Boolean(token),
      followupSecretConfigured: Boolean(followupSecret),
      cronSecretConfigured: Boolean(cronSecret),
      webhookSecretConfigured: Boolean(webhookSecret),
      railwayWorkerHeaderPresent: Boolean(workerHeader),
      railwayWorkerServiceIdPresent: Boolean(workerServiceId),
    });
    return false;
  }

  console.log('[FollowUp Cron] Authorization accepted', {
    matched: matchedSecret || 'RAILWAY_WORKER',
  });
  return true;
}

async function sendThroughAgentHub(supabase: any, task: any, lead: any) {
  const base = process.env.WHATSAPP_AGENT_URL || process.env.WHATSAPP_QR_SERVICE_URL || 'https://agenthub-whatsapp-service-production.up.railway.app';
  const token = process.env.WHATSAPP_AGENT_TOKEN || process.env.OUTBOUND_API_TOKEN;
  if (task.channel !== 'whatsapp') throw new Error('Automated delivery for this channel is not connected yet');
  if (!base) throw new Error('WhatsApp service URL is not configured');

  const phone = String(lead?.phone || lead?.phone_number || lead?.customer_phone || '').replace(/\D/g, '');
  if (!phone) throw new Error('Lead has no phone number for WhatsApp follow-up');

  const { data: session, error: sessionError } = await supabase
    .from('whatsapp_sessions')
    .select('session_id,status')
    .eq('business_id', task.business_id)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) throw new Error('Could not resolve connected WhatsApp session: ' + sessionError.message);
  if (!session?.session_id) throw new Error('No connected WhatsApp session found for this business');

  const response = await fetch(base.replace(/\/$/, '') + '/sessions/' + encodeURIComponent(session.session_id) + '/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ to: phone + '@s.whatsapp.net', message: task.notes || 'Hi! Just following up to see if you need any help. 😊' }),
  });

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || data?.success === false) throw new Error('WhatsApp agent rejected follow-up: ' + response.status + ' ' + (data?.message || raw));
  return data || { success: true };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const now = new Date();

  // Recover tasks abandoned by a crashed worker. The worker timeout is 120s,
  // so 15 minutes gives ample safety margin without permanently losing a task.
  await supabase
    .from('follow_up_tasks')
    .update({ status: 'pending', last_error: 'Recovered after stale processing lock' })
    .eq('status', 'processing')
    .eq('automation_generated', true)
    .lt('updated_at', new Date(now.getTime() - PROCESSING_STALE_MS).toISOString());

  const { data: due, error } = await supabase
    .from('follow_up_tasks')
    .select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel,scheduled_at')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .eq('automation_generated', true)
    .order('scheduled_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let completed = 0;
  let claimed = 0;
  const failures: string[] = [];

  for (const candidate of due ?? []) {
    // Atomic claim: only the request that changes pending -> processing owns
    // this task. A second concurrent worker gets zero rows and must skip it.
    const { data: task, error: claimError } = await supabase
      .from('follow_up_tasks')
      .update({ status: 'processing', last_error: null })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel,scheduled_at')
      .maybeSingle();

    if (claimError) {
      console.error('[FollowUp Cron] Claim failed', { taskId: candidate.id, error: claimError.message });
      failures.push(candidate.id);
      continue;
    }

    if (!task) {
      console.log('[FollowUp Cron] Task already claimed by another worker', candidate.id);
      continue;
    }

    processed++;
    claimed++;

    try {
      const { data: lead } = task.lead_id
        ? await supabase.from('leads').select('*').eq('id', task.lead_id).maybeSingle()
        : { data: null };
      const { data: automationSettings } = await supabase
        .from('followup_automation_settings')
        .select('enabled, stop_on_customer_reply, stop_on_won')
        .eq('business_id', task.business_id)
        .maybeSingle();

      if (!automationSettings?.enabled) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Automation disabled' }).eq('id', task.id).eq('status', 'processing');
        continue;
      }

      if (lead && automationSettings.stop_on_won && ['won', 'lost'].includes(lead.status)) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: null }).eq('id', task.id).eq('status', 'processing');
        continue;
      }

      if (task.conversation_id) {
        const { data: conversation } = await supabase
          .from('conversations')
          .select('human_takeover')
          .eq('id', task.conversation_id)
          .eq('business_id', task.business_id)
          .maybeSingle();
        if (conversation?.human_takeover) {
          await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Human takeover active' }).eq('id', task.id).eq('status', 'processing');
          continue;
        }
      }

      if (lead && automationSettings.stop_on_customer_reply && lead.conversation_id && Number(task.followup_number || 1) > 1) {
        // Do not cancel the first follow-up merely because the lead originally
        // replied. For later follow-ups, stop only when the customer replied
        // after the previous automated follow-up was actually sent.
        const { data: previousFollowUp } = await supabase
          .from('follow_up_tasks')
          .select('sent_at')
          .eq('lead_id', lead.id)
          .eq('automation_generated', true)
          .eq('status', 'completed')
          .lt('followup_number', task.followup_number)
          .not('sent_at', 'is', null)
          .order('followup_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (previousFollowUp?.sent_at) {
          const { data: customerReply } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', lead.conversation_id)
            .eq('sender_type', 'customer')
            .gt('created_at', previousFollowUp.sent_at)
            .limit(1)
            .maybeSingle();
          if (customerReply) {
            await supabase
              .from('follow_up_tasks')
              .update({ status: 'cancelled', last_error: 'Customer replied after previous automated follow-up' })
              .eq('lead_id', lead.id)
              .eq('automation_generated', true)
              .in('status', ['pending', 'processing']);
            continue;
          }
        }
      }

      // scheduled_at was checked before claiming, so future messages are never
      // sent early. The claim also makes this send single-owner across workers.
      const delivery = await sendThroughAgentHub(supabase, task, lead);
      if (delivery && delivery.success === false) throw new Error(delivery.error || 'WhatsApp follow-up send failed');

      await supabase.from('follow_up_history').insert({
        follow_up_id: task.id,
        business_id: task.business_id,
        action: 'sent',
        notes: task.notes || 'Automated follow-up sent',
      });
      await supabase
        .from('follow_up_tasks')
        .update({ status: 'completed', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', task.id)
        .eq('status', 'processing');
      await supabase.from('activity_logs').insert({
        business_id: task.business_id,
        action: 'automated_followup_processed',
        entity_type: 'follow_up',
        entity_id: task.id,
        metadata: { channel: task.channel, followup_number: task.followup_number },
      });
      completed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown follow-up processing error';
      failures.push(task.id);
      await supabase
        .from('follow_up_tasks')
        .update({ status: 'pending', last_error: message })
        .eq('id', task.id)
        .eq('status', 'processing');
    }
  }

  return NextResponse.json({ ok: true, processed, claimed, completed, failed: failures.length });
}
