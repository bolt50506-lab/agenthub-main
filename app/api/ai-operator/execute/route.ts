import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXECUTABLE_ACTIONS = new Set([
  'create_lead_followup',
  'prepare_payment_reminder',
  'inventory_alert',
]);

function authorized(request: NextRequest) {
  const configured = [
    process.env.AI_OPERATOR_CRON_SECRET,
    process.env.FOLLOWUP_CRON_SECRET,
    process.env.AGENTHUB_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];

  if (!configured.length) return false;
  const bearer = request.headers.get('authorization');
  const header = request.headers.get('x-cron-secret');
  const worker = request.headers.get('x-agenthub-worker') === 'railway-followup-v1';
  const serviceId = request.headers.get('x-railway-service-id');

  return configured.some(secret => bearer === `Bearer ${secret}` || header === secret) ||
    (worker && serviceId === (process.env.RAILWAY_SERVICE_ID || 'dc07c2e6-cdb5-4971-99d3-6e6f6f2f5cc8'));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return jsonError('Unauthorized', 401);

  const body = await request.json().catch(() => ({}));
  const businessId = typeof body.business_id === 'string' ? body.business_id : null;
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  let query = supabase
    .from('operator_actions')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (businessId) query = query.eq('business_id', businessId);

  const { data: actions, error } = await query;
  if (error) return jsonError(error.message, 500);

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const action of actions ?? []) {
    const type = String(action.action_type || '').toLowerCase();
    if (!EXECUTABLE_ACTIONS.has(type)) {
      skipped++;
      continue;
    }

    // Claim atomically so two worker cycles cannot execute the same action.
    const { data: claimed } = await supabase
      .from('operator_actions')
      .update({ status: 'executing', executed_by: null })
      .eq('id', action.id)
      .eq('status', 'approved')
      .select('*')
      .maybeSingle();

    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      const businessIdForAction = claimed.business_id;
      let result: Record<string, unknown> = {};

      if (type === 'create_lead_followup') {
        const leadId = claimed.entity_id || claimed.lead_id;
        if (!leadId) throw new Error('Lead id is missing');

        const { data: lead } = await supabase
          .from('leads')
          .select('id,business_id,name,phone,status,conversation_id')
          .eq('id', leadId)
          .eq('business_id', businessIdForAction)
          .maybeSingle();

        if (!lead) throw new Error('Lead no longer exists');
        if (['won', 'lost'].includes(String(lead.status))) throw new Error('Lead is already closed');

        const { data: existing } = await supabase
          .from('follow_up_tasks')
          .select('id')
          .eq('business_id', businessIdForAction)
          .eq('lead_id', lead.id)
          .in('status', ['pending', 'processing', 'overdue'])
          .limit(1)
          .maybeSingle();

        if (existing) {
          result = { already_queued: true, task_id: existing.id };
        } else {
          const message = String(
            claimed.payload?.message ||
            `Hi ${lead.name || ''}! Just checking in to see if you still need any help. 😊`
          ).trim();

          const { data: task, error: taskError } = await supabase
            .from('follow_up_tasks')
            .insert({
              business_id: businessIdForAction,
              lead_id: lead.id,
              conversation_id: lead.conversation_id || null,
              task_type: 'follow_up',
              scheduled_at: new Date().toISOString(),
              status: 'pending',
              notes: message,
              channel: 'whatsapp',
              automation_generated: true,
              followup_number: 1,
            })
            .select('id')
            .single();

          if (taskError) throw new Error(taskError.message);
          result = { task_id: task.id, queued: true, message };
        }
      } else if (type === 'prepare_payment_reminder') {
        const orderId = claimed.entity_id;
        if (!orderId) throw new Error('Order id is missing');

        const { data: order } = await supabase
          .from('orders')
          .select('id,lead_id,customer_name,balance_due,payment_status,currency')
          .eq('id', orderId)
          .eq('business_id', businessIdForAction)
          .maybeSingle();

        if (!order) throw new Error('Order no longer exists');
        if (['paid', 'cancelled'].includes(String(order.payment_status)) || Number(order.balance_due || 0) <= 0) {
          throw new Error('Order is already paid or has no balance due');
        }
        if (!order.lead_id) {
          result = { prepared: false, reason: 'no_linked_lead' };
        } else {
          const { data: existing } = await supabase
            .from('follow_up_tasks')
            .select('id')
            .eq('business_id', businessIdForAction)
            .eq('lead_id', order.lead_id)
            .in('status', ['pending', 'processing', 'overdue'])
            .limit(1)
            .maybeSingle();

          if (existing) {
            result = { already_queued: true, task_id: existing.id };
          } else {
            const message = `Hi ${order.customer_name || ''}! Just a friendly reminder that your outstanding balance is ${Number(order.balance_due || 0)} ${order.currency || 'PKR'}. Please let us know if you need any help.`.trim();
            const { data: task, error: taskError } = await supabase
              .from('follow_up_tasks')
              .insert({
                business_id: businessIdForAction,
                lead_id: order.lead_id,
                task_type: 'message',
                scheduled_at: new Date().toISOString(),
                status: 'pending',
                notes: message,
                channel: 'whatsapp',
                automation_generated: true,
                followup_number: 1,
              })
              .select('id')
              .single();

            if (taskError) throw new Error(taskError.message);
            result = { task_id: task.id, queued: true, message };
          }
        }
      } else if (type === 'inventory_alert') {
        const payload = claimed.payload || {};
        const { error: eventError } = await supabase.from('business_events').insert({
          business_id: businessIdForAction,
          event_type: 'operator_inventory_alert',
          entity_type: claimed.entity_type || 'product',
          entity_id: claimed.entity_id || null,
          summary: claimed.title || 'Inventory alert',
          payload,
        });
        if (eventError) throw new Error(eventError.message);
        result = { alerted: true, entity_id: claimed.entity_id || null };
      }

      const { error: completeError } = await supabase
        .from('operator_actions')
        .update({
          status: 'completed',
          result,
          executed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', claimed.id)
        .eq('status', 'executing');

      if (completeError) throw new Error(completeError.message);
      completed++;
      results.push({ id: claimed.id, action_type: type, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from('operator_actions')
        .update({
          status: 'failed',
          error_message: message,
          result: {},
          executed_at: new Date().toISOString(),
        })
        .eq('id', claimed.id)
        .eq('status', 'executing');
      failed++;
      results.push({ id: claimed.id, action_type: type, error: message });
    }
  }

  return NextResponse.json({
    success: true,
    found: actions?.length ?? 0,
    completed,
    failed,
    skipped,
    results,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
