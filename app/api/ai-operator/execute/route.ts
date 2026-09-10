import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const QUEUEABLE_ACTIONS = new Set([
  'follow_up',
  'send_followup',
  'capture_lead',
  'update_lead',
  'schedule_followup',
  'appointment_reminder',
  'recover_conversation',
]);

function authorized(request: NextRequest) {
  const secret = process.env.AI_OPERATOR_CRON_SECRET || process.env.FOLLOWUP_CRON_SECRET;
  if (!secret) return false;
  return (
    request.headers.get('authorization') === `Bearer ${secret}` ||
    request.headers.get('x-cron-secret') === secret
  );
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const businessId = typeof body.business_id === 'string' ? body.business_id : null;
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  let query = supabase
    .from('ai_operator_actions')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (businessId) query = query.eq('business_id', businessId);

  const { data: actions, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let queued = 0;
  let skipped = 0;

  for (const action of actions ?? []) {
    const type = String(action.action_type ?? action.type ?? '').toLowerCase();
    if (!QUEUEABLE_ACTIONS.has(type)) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('ai_operator_actions')
      .update({
        status: 'queued',
        queued_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('status', 'approved');

    if (!updateError) queued++;
  }

  return NextResponse.json({
    success: true,
    found: actions?.length ?? 0,
    queued,
    skipped,
    message: 'Safe autonomous actions queued for execution by the worker.',
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
