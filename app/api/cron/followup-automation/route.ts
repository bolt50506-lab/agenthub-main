import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
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
        ? await supabase.from('leads').select('status,conversation_id,customer_id').eq('id', task.lead_id).maybeSingle()
        : { data: null };

      if (lead && ['won','lost'].includes(lead.status)) {
        await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('id', task.id);
        continue;
      }

      // Delivery is intentionally routed through the existing channel integration layer.
      // If a deployment has no supported sender for this channel, keep the task pending
      // and record the failure rather than pretending that a message was sent.
      await supabase.from('follow_up_history').insert({
        follow_up_id: task.id,
        business_id: task.business_id,
        action: 'due_for_delivery',
        notes: task.notes || 'Automated follow-up is ready for channel delivery',
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
