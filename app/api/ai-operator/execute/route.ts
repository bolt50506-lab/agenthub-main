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
  'appointment_recovery',
  'recover_conversation',
  'capture_lead',
  'update_lead',
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

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function queueFollowup(params: {
  businessId: string;
  leadId: string;
  conversationId?: string | null;
  appointmentId?: string | null;
  message: string;
  taskType?: string;
}) {
  const { businessId, leadId, conversationId, appointmentId, message, taskType = 'follow_up' } = params;
  let existingQuery = supabase
    .from('follow_up_tasks')
    .select('id')
    .eq('business_id', businessId)
    .eq('lead_id', leadId)
    .in('status', ['pending', 'processing', 'overdue'])
    .limit(1);
  if (appointmentId) existingQuery = existingQuery.eq('appointment_id', appointmentId);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) return { already_queued: true, task_id: existing.id };

  const { data: task, error } = await supabase.from('follow_up_tasks').insert({
    business_id: businessId,
    lead_id: leadId,
    appointment_id: appointmentId || null,
    conversation_id: conversationId || null,
    task_type: taskType,
    scheduled_at: new Date().toISOString(),
    status: 'pending',
    notes: message,
    channel: 'whatsapp',
    automation_generated: true,
    followup_number: 1,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { task_id: task.id, queued: true, message };
}

async function autoDiscover(businessId: string, limit: number) {
  const { data: settings } = await supabase.from('operator_settings').select('*').eq('business_id', businessId).maybeSingle();
  if (!settings || settings.mode !== 'autonomous') return 0;
  const actions: any[] = [];

  if (settings.auto_appointment_recovery) {
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const { data: appointments } = await supabase.from('appointments')
      .select('id,lead_id,customer_name,date,start_time,service_name,updated_at,status')
      .eq('business_id', businessId).eq('status', 'cancelled').gte('updated_at', since).limit(limit);
    for (const a of appointments || []) {
      if (!a.lead_id) continue;
      actions.push({
        business_id: businessId,
        action_type: 'appointment_recovery',
        entity_type: 'appointment',
        entity_id: a.id,
        title: `Recover cancelled appointment for ${a.customer_name || 'customer'}`,
        description: `Offer a new appointment after cancellation${a.service_name ? ` for ${a.service_name}` : ''}.`,
        risk_level: 'medium',
        idempotency_key: `appointment-recovery:${a.id}`,
        payload: { lead_id: a.lead_id },
        status: 'approved',
      });
    }
  }

  const { data: conversations } = await supabase.from('conversations')
    .select('id,customer_id,channel,last_message_at,human_takeover,status')
    .eq('business_id', businessId).eq('status', 'active').eq('human_takeover', false)
    .lt('last_message_at', new Date(Date.now() - Number(settings.quiet_conversation_hours || 24) * 3600000).toISOString())
    .limit(limit);

  if (settings.auto_followups) {
    for (const c of conversations || []) {
      const { data: lead } = await supabase.from('leads').select('id,name,phone,conversation_id,status').eq('business_id', businessId).eq('conversation_id', c.id).limit(1).maybeSingle();
      if (!lead || ['won', 'lost'].includes(String(lead.status))) continue;
      actions.push({
        business_id: businessId,
        action_type: 'recover_conversation',
        entity_type: 'conversation',
        entity_id: c.id,
        title: `Re-engage quiet conversation`,
        description: 'Send a helpful WhatsApp re-engagement message.',
        risk_level: 'medium',
        idempotency_key: `quiet-conversation:${c.id}`,
        payload: { lead_id: lead.id, message: `Hi ${lead.name || ''}! Just checking in — is there anything else I can help you with? 😊` },
        status: 'approved',
      });
    }
  }

  const { data: unlinked } = await supabase.from('conversations')
    .select('id,customer_id,channel,last_message_at')
    .eq('business_id', businessId).eq('status', 'active').not('customer_id', 'is', null).limit(limit);
  for (const c of unlinked || []) {
    const { data: existingLead } = await supabase.from('leads').select('id').eq('business_id', businessId).eq('conversation_id', c.id).limit(1).maybeSingle();
    if (!existingLead) {
      actions.push({
        business_id: businessId,
        action_type: 'capture_lead',
        entity_type: 'conversation',
        entity_id: c.id,
        title: 'Capture conversation as a lead',
        description: 'Create a lead automatically from an active customer conversation.',
        risk_level: 'low',
        idempotency_key: `capture-lead:${c.id}`,
        payload: { channel: c.channel },
        status: 'approved',
      });
    }
  }

  if (!actions.length) return 0;
  const { error } = await supabase.from('operator_actions').upsert(actions, { onConflict: 'business_id,idempotency_key' });
  if (error) throw new Error(error.message);
  return actions.length;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return jsonError('Unauthorized', 401);
  const body = await request.json().catch(() => ({}));
  const businessId = typeof body.business_id === 'string' ? body.business_id : null;
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);

  try {
    if (businessId) await autoDiscover(businessId, limit);
    else {
      const { data: settings } = await supabase.from('operator_settings').select('business_id').eq('mode', 'autonomous').limit(20);
      for (const row of settings || []) await autoDiscover(row.business_id, Math.min(limit, 20));
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }

  let query = supabase.from('operator_actions').select('*').eq('status', 'approved').order('created_at', { ascending: true }).limit(limit);
  if (businessId) query = query.eq('business_id', businessId);
  const { data: actions, error } = await query;
  if (error) return jsonError(error.message, 500);

  let completed = 0, failed = 0, skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const action of actions || []) {
    const type = String(action.action_type || '').toLowerCase();
    if (!EXECUTABLE_ACTIONS.has(type)) { skipped++; continue; }
    const { data: claimed } = await supabase.from('operator_actions').update({ status: 'executing', executed_by: null })
      .eq('id', action.id).eq('status', 'approved').select('*').maybeSingle();
    if (!claimed) { skipped++; continue; }

    try {
      const bid = claimed.business_id;
      let result: Record<string, unknown> = {};
      const payload = claimed.payload && typeof claimed.payload === 'object' ? claimed.payload as Record<string, any> : {};

      if (type === 'create_lead_followup') {
        const leadId = claimed.entity_id;
        if (!leadId) throw new Error('Lead id is missing');
        const { data: lead } = await supabase.from('leads').select('id,name,phone,conversation_id,status').eq('id', leadId).eq('business_id', bid).maybeSingle();
        if (!lead) throw new Error('Lead no longer exists');
        if (['won', 'lost'].includes(String(lead.status))) throw new Error('Lead is already closed');
        result = await queueFollowup({ businessId: bid, leadId: lead.id, conversationId: lead.conversation_id, message: text(payload.message, `Hi ${lead.name || ''}! Just checking in to see if you still need any help. 😊`) });
      } else if (type === 'prepare_payment_reminder') {
        const { data: order } = await supabase.from('orders').select('id,lead_id,customer_name,balance_due,payment_status,currency').eq('id', claimed.entity_id).eq('business_id', bid).maybeSingle();
        if (!order) throw new Error('Order no longer exists');
        if (['paid', 'cancelled'].includes(String(order.payment_status)) || Number(order.balance_due || 0) <= 0) throw new Error('Order is already paid or has no balance due');
        if (!order.lead_id) { result = { prepared: false, reason: 'no_linked_lead' }; }
        else result = await queueFollowup({ businessId: bid, leadId: order.lead_id, message: `Hi ${order.customer_name || ''}! Just a friendly reminder that your outstanding balance is ${Number(order.balance_due || 0)} ${order.currency || 'PKR'}. Please let us know if you need any help.`.trim(), taskType: 'message' });
      } else if (type === 'appointment_recovery') {
        const { data: appointment } = await supabase.from('appointments').select('id,lead_id,customer_name,service_name,status,date,start_time').eq('id', claimed.entity_id).eq('business_id', bid).maybeSingle();
        if (!appointment) throw new Error('Appointment no longer exists');
        if (appointment.status !== 'cancelled') { result = { skipped: true, reason: 'appointment_no_longer_cancelled' }; }
        else if (!appointment.lead_id) { result = { skipped: true, reason: 'no_linked_lead' }; }
        else result = await queueFollowup({ businessId: bid, leadId: appointment.lead_id, appointmentId: appointment.id, message: `Hi ${appointment.customer_name || ''}! We noticed your ${appointment.service_name ? appointment.service_name + ' ' : ''}appointment was cancelled. Would you like me to help arrange a new time? 😊`.trim(), taskType: 'appointment_recovery' });
      } else if (type === 'recover_conversation') {
        const leadId = text(payload.lead_id) || claimed.entity_id;
        const { data: lead } = await supabase.from('leads').select('id,name,phone,conversation_id,status').eq('id', leadId).eq('business_id', bid).maybeSingle();
        if (!lead) throw new Error('Lead for conversation recovery no longer exists');
        if (['won', 'lost'].includes(String(lead.status))) throw new Error('Lead is already closed');
        result = await queueFollowup({ businessId: bid, leadId: lead.id, conversationId: lead.conversation_id || (claimed.entity_type === 'conversation' ? claimed.entity_id : null), message: text(payload.message, `Hi ${lead.name || ''}! Just checking in — is there anything else I can help you with? 😊`) });
      } else if (type === 'capture_lead') {
        const { data: conversation } = await supabase.from('conversations').select('id,customer_id,channel').eq('id', claimed.entity_id).eq('business_id', bid).maybeSingle();
        if (!conversation?.customer_id) throw new Error('Conversation has no customer');
        const { data: customer } = await supabase.from('customers').select('id,name,phone,email').eq('id', conversation.customer_id).eq('business_id', bid).maybeSingle();
        if (!customer) throw new Error('Customer no longer exists');
        const { data: existing } = await supabase.from('leads').select('id').eq('business_id', bid).eq('conversation_id', conversation.id).limit(1).maybeSingle();
        if (existing) result = { already_exists: true, lead_id: existing.id };
        else {
          const { data: lead, error: leadError } = await supabase.from('leads').insert({ business_id: bid, customer_id: customer.id, conversation_id: conversation.id, name: customer.name, phone: customer.phone, email: customer.email, source: conversation.channel || 'conversation', status: 'new' }).select('id').single();
          if (leadError) throw new Error(leadError.message);
          result = { lead_id: lead.id, created: true };
        }
      } else if (type === 'update_lead') {
        const leadId = claimed.entity_id;
        if (!leadId) throw new Error('Lead id is missing');
        const allowed = ['name','phone','email','interested_product','budget','location','requirement','status','conversation_summary'];
        const patch: Record<string, unknown> = {};
        for (const key of allowed) if (payload[key] !== undefined) patch[key] = payload[key];
        if (!Object.keys(patch).length) throw new Error('No lead fields supplied');
        const { error: updateError } = await supabase.from('leads').update(patch).eq('id', leadId).eq('business_id', bid);
        if (updateError) throw new Error(updateError.message);
        result = { updated: true, fields: Object.keys(patch) };
      } else if (type === 'inventory_alert') {
        const { error: eventError } = await supabase.from('business_events').insert({ business_id: bid, event_type: 'operator_inventory_alert', entity_type: claimed.entity_type || 'product', entity_id: claimed.entity_id || null, summary: claimed.title || 'Inventory alert', payload });
        if (eventError) throw new Error(eventError.message);
        result = { alerted: true, entity_id: claimed.entity_id || null };
      }

      const { error: completeError } = await supabase.from('operator_actions').update({ status: 'completed', result, executed_at: new Date().toISOString(), error_message: null }).eq('id', claimed.id).eq('status', 'executing');
      if (completeError) throw new Error(completeError.message);
      completed++;
      results.push({ id: claimed.id, action_type: type, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('operator_actions').update({ status: 'failed', error_message: message, result: {}, executed_at: new Date().toISOString() }).eq('id', claimed.id).eq('status', 'executing');
      failed++;
      results.push({ id: claimed.id, action_type: type, error: message });
    }
  }

  return NextResponse.json({ success: true, found: actions?.length || 0, completed, failed, skipped, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
