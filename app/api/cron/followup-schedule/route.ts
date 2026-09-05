import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Railway is the long-running scheduler for Hobby Vercel deployments.
// Keep the normal secret authentication, but also accept the dedicated
// Railway worker identity so a stale/missing Vercel cron secret cannot stop
// follow-up automation. The service ID is fixed to this AgentHub Railway
// service and is not treated as a secret.
const RAILWAY_WORKER_SERVICE_ID = 'dc07c2e6-cdb5-4971-99d3-6e6f6f2f5cc8';

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
      bearerFormat: header.startsWith('Bearer '),
      tokenPresent: Boolean(token),
      followupSecretConfigured: Boolean(followupSecret),
      cronSecretConfigured: Boolean(cronSecret),
      webhookSecretConfigured: Boolean(webhookSecret),
      railwayWorkerHeaderPresent: Boolean(workerHeader),
      railwayWorkerServiceIdPresent: Boolean(workerServiceId),
      tokenLength: token.length,
    });
    return false;
  }

  console.log('[FollowUp Cron] Authorization accepted', {
    matched: matchedSecret || (matchedRailwayWorker ? 'RAILWAY_WORKER' : 'unknown'),
  });
  return true;
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
