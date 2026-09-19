import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceKey) {
    throw new Error('Supabase server environment variables are not configured');
  }

  return createClient(url, serviceKey);
}

function authorized(request: NextRequest) {
  const secret = process.env.AI_OPERATOR_CRON_SECRET || process.env.FOLLOWUP_CRON_SECRET;
  return !!secret && (
    request.headers.get('authorization') === `Bearer ${secret}` ||
    request.headers.get('x-cron-secret') === secret
  );
}

const SAFE = new Set([
  'follow_up',
  'send_followup',
  'schedule_followup',
  'appointment_reminder',
  'recover_conversation',
  'capture_lead',
  'update_lead',
]);

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Supabase server configuration is missing' },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  let q = supabase
    .from('ai_operator_actions')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (typeof body.business_id === 'string') {
    q = q.eq('business_id', body.business_id);
  }

  const { data: actions, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const action of actions ?? []) {
    const type = String(action.action_type ?? action.type ?? '').toLowerCase();

    if (!SAFE.has(type)) {
      results.push({ id: action.id, status: 'skipped' });
      continue;
    }

    const { data: claimed, error: claimError } = await supabase
      .from('ai_operator_actions')
      .update({
        status: 'queued',
        queued_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle();

    results.push({
      id: action.id,
      status: claimError ? 'error' : claimed ? 'queued' : 'skipped',
      reason: claimError?.message,
    });
  }

  return NextResponse.json({
    success: true,
    found: actions?.length ?? 0,
    results,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
