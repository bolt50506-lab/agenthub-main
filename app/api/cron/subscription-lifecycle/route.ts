import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const now = new Date();
  const { data: subscriptions, error } = await supabase
    .from('business_subscriptions')
    .select('id,business_id,status,end_date,grace_end_date,reminder_stage')
    .in('status', ['active','trial','suspended']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let graceStarted = 0;
  let suspended = 0;
  let reminders = 0;

  for (const sub of subscriptions ?? []) {
    if (!sub.end_date) continue;
    const end = new Date(sub.end_date);
    const graceEnd = sub.grace_end_date ? new Date(sub.grace_end_date) : null;

    if ((sub.status === 'active' || sub.status === 'trial') && end < now && !graceEnd) {
      const newGraceEnd = new Date(end);
      newGraceEnd.setDate(newGraceEnd.getDate() + 10);
      await supabase.from('business_subscriptions').update({
        status: 'active',
        grace_end_date: newGraceEnd.toISOString(),
        reminder_stage: 1,
      }).eq('id', sub.id);
      await supabase.from('businesses').update({
        subscription_grace_ends_at: newGraceEnd.toISOString(),
        subscription_status: 'active',
      }).eq('id', sub.business_id);
      graceStarted++;
      continue;
    }

    if (graceEnd && graceEnd < now && sub.status !== 'suspended') {
      await supabase.from('business_subscriptions').update({
        status: 'suspended',
        suspended_at: now.toISOString(),
      }).eq('id', sub.id);
      await supabase.from('businesses').update({
        subscription_status: 'suspended',
        subscription_plan_id: null,
        subscription_grace_ends_at: null,
      }).eq('id', sub.business_id);
      suspended++;
      continue;
    }

    if (graceEnd && graceEnd >= now) {
      const daysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / 86400000);
      const stage = daysLeft <= 1 ? 4 : daysLeft <= 3 ? 3 : daysLeft <= 7 ? 2 : 1;
      if (stage > (sub.reminder_stage ?? 0)) {
        await supabase.from('business_subscriptions').update({ reminder_stage: stage }).eq('id', sub.id);
        reminders++;
      }
    }
  }

  return NextResponse.json({ ok: true, graceStarted, reminders, suspended });
}
