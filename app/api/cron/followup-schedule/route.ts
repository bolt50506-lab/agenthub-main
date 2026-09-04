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
  const { data: settingsRows, error } = await supabase
    .from('followup_automation_settings')
    .select('*')
    .eq('enabled', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let scheduled = 0;

  for (const settings of settingsRows ?? []) {
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', settings.business_id)
      .gte('created_at', settings.created_at)
      .not('status', 'in', '("won","lost")')
      .limit(200);

    for (const lead of leads ?? []) {
      const createdAt = new Date(lead.created_at || Date.now());
      const delays = [
        Number(settings.first_delay_hours || 24),
        Number(settings.second_delay_hours || 72),
        Number(settings.third_delay_hours || 168),
      ].slice(0, Math.max(1, Math.min(3, Number(settings.max_followups || 3))));

      for (let index = 0; index < delays.length; index++) {
        const number = index + 1;
        const { data: existing } = await supabase
          .from('follow_up_tasks')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('automation_generated', true)
          .eq('followup_number', number)
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        const due = new Date(createdAt.getTime() + delays[index] * 60 * 60 * 1000);
        await supabase.from('follow_up_tasks').insert({
          business_id: settings.business_id,
          lead_id: lead.id,
          conversation_id: lead.conversation_id || null,
          task_type: 'follow_up',
          notes: 'Hi! Just following up to see if you need any help or have any questions. 😊',
          scheduled_at: due.toISOString(),
          status: 'pending',
          automation_generated: true,
          followup_number: number,
          channel: (settings.channels || ['whatsapp'])[0] || 'whatsapp',
        });
        scheduled++;
      }
    }
  }

  return NextResponse.json({ ok: true, scheduled });
}
