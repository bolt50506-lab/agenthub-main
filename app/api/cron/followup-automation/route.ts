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
  const matchedRailwayWorker = workerHeader === 'railway-followup-v1' && workerServiceId === RAILWAY_WORKER_SERVICE_ID;
  return Boolean(matchedSecret || matchedRailwayWorker);
}

async function sendThroughAgentHub(supabase: any, task: any, lead: any) {
  const base = process.env.WHATSAPP_AGENT_URL || process.env.WHATSAPP_QR_SERVICE_URL || 'https://agenthub-whatsapp-service-production.up.railway.app';
  const token = process.env.WHATSAPP_AGENT_TOKEN || process.env.OUTBOUND_API_TOKEN || process.env.AGENTHUB_WEBHOOK_SECRET;
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

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;

  const serviceBase = base.replace(/\/$/, '');
  const sendUrl = serviceBase + '/sessions/' + encodeURIComponent(session.session_id) + '/send';
  const response = await fetch(sendUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to: phone + '@s.whatsapp.net', message: task.notes || 'Hi! Just following up to see if you need any help. 😊' }),
  });

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  // Railway is intentionally authoritative about the live Baileys session. A
  // connected row in Supabase can survive a Railway restart when the auth
  // directory was not persisted. In that case, recreate the session so the
  // dashboard can expose a fresh QR instead of retrying a dead socket forever.
  if (response.status === 404 && data?.error === 'Session not found') {
    try {
      const restoreResponse = await fetch(serviceBase + '/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: session.session_id }),
      });
      const restoreRaw = await restoreResponse.text();
      let restoreData: any = null;
      try { restoreData = restoreRaw ? JSON.parse(restoreRaw) : null; } catch {}
      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('business_id', task.business_id)
        .eq('session_id', session.session_id);
      throw new Error('WhatsApp session was lost after the service restart. A new QR session was initialized; reconnect WhatsApp from the dashboard before automated follow-ups resume. ' + (restoreData?.error || ''));
    } catch (recoveryError) {
      if (recoveryError instanceof Error && recoveryError.message.startsWith('WhatsApp session was lost')) throw recoveryError;
      throw new Error('WhatsApp session was lost after the service restart and could not be reinitialized: ' + (recoveryError instanceof Error ? recoveryError.message : String(recoveryError)));
    }
  }

  if (!response.ok || data?.success === false) throw new Error('WhatsApp agent rejected follow-up: ' + response.status + ' ' + (data?.error || data?.message || raw));
  return data || { success: true };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const now = new Date();
  await supabase.from('follow_up_tasks').update({ status: 'pending', last_error: 'Recovered after stale processing lock' }).eq('status', 'processing').eq('automation_generated', true).lt('updated_at', new Date(now.getTime() - PROCESSING_STALE_MS).toISOString());
  const { data: due, error } = await supabase.from('follow_up_tasks').select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel,scheduled_at').eq('status', 'pending').lte('scheduled_at', now.toISOString()).eq('automation_generated', true).order('scheduled_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let processed = 0, completed = 0, claimed = 0;
  const failures: string[] = [];
  for (const candidate of due ?? []) {
    const { data: task, error: claimError } = await supabase.from('follow_up_tasks').update({ status: 'processing', last_error: null }).eq('id', candidate.id).eq('status', 'pending').select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel,scheduled_at').maybeSingle();
    if (claimError) { failures.push(candidate.id); continue; }
    if (!task) continue;
    processed++; claimed++;
    try {
      const { data: lead } = task.lead_id ? await supabase.from('leads').select('*').eq('id', task.lead_id).maybeSingle() : { data: null };
      const { data: automationSettings } = await supabase.from('followup_automation_settings').select('enabled, stop_on_customer_reply, stop_on_won').eq('business_id', task.business_id).maybeSingle();
      if (!automationSettings?.enabled) { await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Automation disabled' }).eq('id', task.id).eq('status', 'processing'); continue; }
      if (lead && automationSettings.stop_on_won && ['won', 'lost'].includes(lead.status)) { await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: null }).eq('id', task.id).eq('status', 'processing'); continue; }
      if (task.conversation_id) {
        const { data: conversation } = await supabase.from('conversations').select('human_takeover').eq('id', task.conversation_id).eq('business_id', task.business_id).maybeSingle();
        if (conversation?.human_takeover) { await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Human takeover active' }).eq('id', task.id).eq('status', 'processing'); continue; }
      }
      if (lead && automationSettings.stop_on_customer_reply && lead.conversation_id && Number(task.followup_number || 1) > 1) {
        const { data: previousFollowUp } = await supabase.from('follow_up_tasks').select('sent_at').eq('lead_id', lead.id).eq('automation_generated', true).eq('status', 'completed').lt('followup_number', task.followup_number).not('sent_at', 'is', null).order('followup_number', { ascending: false }).limit(1).maybeSingle();
        if (previousFollowUp?.sent_at) {
          const { data: customerReply } = await supabase.from('messages').select('id').eq('conversation_id', lead.conversation_id).eq('sender_type', 'customer').gt('created_at', previousFollowUp.sent_at).limit(1).maybeSingle();
          if (customerReply) { await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Customer replied after previous automated follow-up' }).eq('lead_id', lead.id).eq('automation_generated', true).in('status', ['pending', 'processing']); continue; }
        }
      }
      const delivery = await sendThroughAgentHub(supabase, task, lead);
      if (delivery && delivery.success === false) throw new Error(delivery.error || 'WhatsApp follow-up send failed');
      await supabase.from('follow_up_history').insert({ follow_up_id: task.id, business_id: task.business_id, action: 'sent', notes: task.notes || 'Automated follow-up sent' });
      await supabase.from('follow_up_tasks').update({ status: 'completed', sent_at: new Date().toISOString(), last_error: null }).eq('id', task.id).eq('status', 'processing');
      await supabase.from('activity_logs').insert({ business_id: task.business_id, action: 'automated_followup_processed', entity_type: 'follow_up', entity_id: task.id, metadata: { channel: task.channel, followup_number: task.followup_number } });
      completed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown follow-up processing error';
      failures.push(task.id);
      await supabase.from('follow_up_tasks').update({ status: 'pending', last_error: message }).eq('id', task.id).eq('status', 'processing');
    }
  }
  return NextResponse.json({ ok: true, processed, claimed, completed, failed: failures.length });
}
