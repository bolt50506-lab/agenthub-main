import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function authorized(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const followupSecret = process.env.FOLLOWUP_CRON_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const webhookSecret = process.env.AGENTHUB_WEBHOOK_SECRET;
  return (
    (Boolean(followupSecret) && header === `Bearer ${followupSecret}`) ||
    (Boolean(cronSecret) && header === `Bearer ${cronSecret}`) ||
    (Boolean(webhookSecret) && header === `Bearer ${webhookSecret}`)
  );
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
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('follow_up_tasks')
    .select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel')
    .eq('status', 'pending').lte('scheduled_at', now).eq('automation_generated', true).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let completed = 0;
  const failures: string[] = [];

  for (const task of due ?? []) {
    processed++;
    try {
      const { data: lead } = task.lead_id ? await supabase.from('leads').select('*').eq('id', task.lead_id).maybeSingle() : { data: null };
      const { data: automationSettings } = await supabase
        .from('followup_automation_settings')
        .select('enabled, stop_on_customer_reply, stop_on_won')
        .eq('business_id', task.business_id).maybeSingle();

      if (!automationSettings?.enabled) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Automation disabled' }).eq('id', task.id);
        continue;
      }

      if (lead && automationSettings.stop_on_won && ['won', 'lost'].includes(lead.status)) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: null }).eq('id', task.id);
        continue;
      }

      // Human takeover always wins over automation, regardless of the global
      // follow-up settings. Cancel the current task so it cannot fire again.
      if (task.conversation_id) {
        const { data: conversation } = await supabase
          .from('conversations')
          .select('human_takeover')
          .eq('id', task.conversation_id)
          .eq('business_id', task.business_id)
          .maybeSingle();
        if (conversation?.human_takeover) {
          await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: 'Human takeover active' }).eq('id', task.id);
          continue;
        }
      }

      if (lead && automationSettings.stop_on_customer_reply && lead.conversation_id) {
        const { data: customerReply } = await supabase
          .from('messages').select('id').eq('conversation_id', lead.conversation_id)
          .eq('sender_type', 'customer').gt('created_at', lead.created_at).limit(1).maybeSingle();
        if (customerReply) {
          await supabase.from('follow_up_tasks').update({ status: 'cancelled', last_error: null })
            .eq('lead_id', lead.id).eq('automation_generated', true).eq('status', 'pending');
          continue;
        }
      }

      const delivery = await sendThroughAgentHub(supabase, task, lead);
      if (delivery && delivery.success === false) throw new Error(delivery.error || 'WhatsApp follow-up send failed');

      await supabase.from('follow_up_history').insert({ follow_up_id: task.id, business_id: task.business_id, action: 'sent', notes: task.notes || 'Automated follow-up sent' });
      await supabase.from('follow_up_tasks').update({ status: 'completed', sent_at: new Date().toISOString(), last_error: null }).eq('id', task.id);
      await supabase.from('activity_logs').insert({ business_id: task.business_id, action: 'automated_followup_processed', entity_type: 'follow_up', entity_id: task.id, metadata: { channel: task.channel, followup_number: task.followup_number } });
      completed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown follow-up processing error';
      failures.push(task.id);
      await supabase.from('follow_up_tasks').update({ last_error: message }).eq('id', task.id);
    }
  }

  return NextResponse.json({ ok: true, processed, completed, failed: failures.length });
}
