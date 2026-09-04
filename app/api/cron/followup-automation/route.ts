import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
}

async function sendThroughAgentHub(task: any, lead: any) {
  const base = process.env.WHATSAPP_AGENT_URL;
  const token = process.env.WHATSAPP_AGENT_TOKEN;
  if (task.channel !== 'whatsapp') throw new Error('Automated delivery for this channel is not connected yet');
  if (!base) throw new Error('WHATSAPP_AGENT_URL is not configured');
  const phone = lead?.phone || lead?.phone_number || lead?.customer_phone;
  if (!phone) throw new Error('Lead has no phone number for WhatsApp follow-up');
  const response = await fetch(base.replace(/\/$/, '') + '/send-message', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ phoneNumber: phone, message: task.notes || 'Hi! Just following up to see if you need any help. 😊', businessId: task.business_id, followUpTaskId: task.id }),
  });
  if (!response.ok) throw new Error('WhatsApp agent rejected follow-up: ' + response.status + ' ' + await response.text());
  return response.json().catch(() => ({ success: true }));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('follow_up_tasks')
    .select('id,business_id,lead_id,conversation_id,task_type,notes,followup_number,channel')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .eq('automation_generated', true)
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let completed = 0;
  const failures: string[] = [];

  for (const task of due ?? []) {
    processed++;
    try {
      const { data: lead } = task.lead_id
        ? await supabase.from('leads').select('*').eq('id', task.lead_id).maybeSingle()
        : { data: null };

      if (lead && ['won','lost'].includes(lead.status)) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('id', task.id);
        continue;
      }

      const delivery = await sendThroughAgentHub(task, lead);
      if (delivery && delivery.success === false) throw new Error(delivery.error || 'WhatsApp follow-up send failed');

      await supabase.from('follow_up_history').insert({
        follow_up_id: task.id,
        business_id: task.business_id,
        action: 'sent',
        notes: task.notes || 'Automated follow-up sent',
      });

      await supabase.from('follow_up_tasks').update({
        status: 'completed',
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', task.id);

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
      await supabase.from('follow_up_tasks').update({ last_error: message }).eq('id', task.id);
    }
  }

  return NextResponse.json({ ok: true, processed, completed, failed: failures.length });
}
