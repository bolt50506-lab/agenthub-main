import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function getContext() {
  const auth = await createServerClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return { user: null, businessId: null };

  const { data: profile } = await auth.from('profiles').select('active_business_id').eq('id', user.id).maybeSingle();
  const businessId = profile?.active_business_id || null;
  if (!businessId) return { user, businessId: null };

  const { data: member } = await auth.from('business_members').select('role,status').eq('business_id', businessId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (!member) return { user, businessId: null };
  return { user, businessId, role: member.role };
}

function ok(data: unknown) { return NextResponse.json({ ok: true, ...((data as object) || {}) }); }
function fail(message: string, status = 400) { return NextResponse.json({ ok: false, error: message }, { status }); }

async function ensureSettings(supabase: any, businessId: string, userId?: string) {
  const { data } = await supabase.from('operator_settings').select('*').eq('business_id', businessId).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('operator_settings').insert({ business_id: businessId, updated_by: userId || null }).select('*').single();
  return created;
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx.user || !ctx.businessId) return fail('Authentication required', 401);
  const supabase = createServiceClient();
  const settings = await ensureSettings(supabase, ctx.businessId, ctx.user.id);
  const { data: actions } = await supabase.from('operator_actions').select('*').eq('business_id', ctx.businessId).order('created_at', { ascending: false }).limit(50);
  return ok({ settings, actions: actions || [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx.user || !ctx.businessId) return fail('Authentication required', 401);
  if (!['owner', 'admin'].includes(ctx.role || '')) return fail('Only business owners and admins can change Operator settings or execute actions', 403);

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();
  const businessId = ctx.businessId;

  if (body.action === 'settings') {
    const allowedModes = ['review', 'prepare', 'autonomous'];
    const mode = allowedModes.includes(body.mode) ? body.mode : undefined;
    const patch: Record<string, unknown> = { updated_by: ctx.user.id };
    if (mode) patch.mode = mode;
    for (const key of ['stale_lead_hours','quiet_conversation_hours']) if (Number.isFinite(Number(body[key]))) patch[key] = Math.max(1, Math.min(720, Math.round(Number(body[key]))));
    for (const key of ['auto_followups','auto_payment_reminders','auto_appointment_recovery','inventory_alerts']) if (typeof body[key] === 'boolean') patch[key] = body[key];
    const { data, error } = await supabase.from('operator_settings').upsert({ business_id: businessId, ...patch }, { onConflict: 'business_id' }).select('*').single();
    if (error) return fail(error.message, 500);
    await supabase.from('activity_logs').insert({ business_id: businessId, user_id: ctx.user.id, action: 'operator_settings_updated', entity_type: 'operator_settings', metadata: patch });
    return ok({ settings: data });
  }

  if (body.action === 'execute') {
    const actionId = String(body.action_id || '').trim();
    if (!actionId) return fail('action_id is required');
    const { data: action, error: actionError } = await supabase.from('operator_actions').select('*').eq('id', actionId).eq('business_id', businessId).maybeSingle();
    if (actionError || !action) return fail('Operator action not found', 404);
    if (!['proposed', 'approved'].includes(action.status)) return fail(`Action is already ${action.status}`);
    if (action.risk_level === 'high' && action.status !== 'approved') return fail('High-impact actions require approval');

    await supabase.from('operator_actions').update({ status: 'executing', executed_by: ctx.user.id }).eq('id', action.id).in('status', ['proposed','approved']);
    let result: Record<string, unknown> = {};
    try {
      if (action.action_type === 'create_lead_followup') {
        const leadId = action.entity_id;
        const { data: lead } = await supabase.from('leads').select('id,business_id,phone,name,conversation_id,status').eq('id', leadId).eq('business_id', businessId).maybeSingle();
        if (!lead) throw new Error('Lead no longer exists');
        if (['won','lost'].includes(lead.status)) throw new Error('Lead is already closed');
        const { data: existing } = await supabase.from('follow_up_tasks').select('id').eq('business_id', businessId).eq('lead_id', lead.id).in('status', ['pending','processing']).limit(1).maybeSingle();
        if (existing) throw new Error('Lead already has an active follow-up');
        const notes = String(action.payload?.message || `Hi ${lead.name || ''}! Just checking in to see if you still need any help. 😊`).trim();
        const { data: task, error } = await supabase.from('follow_up_tasks').insert({ business_id: businessId, lead_id: lead.id, conversation_id: lead.conversation_id || null, task_type: 'follow_up', scheduled_at: new Date().toISOString(), status: 'pending', notes, channel: 'whatsapp', automation_generated: true, followup_number: 1 }).select('id').single();
        if (error) throw new Error(error.message);
        result = { task_id: task.id, queued: true, message: notes };
        await supabase.from('business_events').insert({ business_id: businessId, event_type: 'operator_followup_queued', entity_type: 'lead', entity_id: lead.id, summary: `Operator queued a recovery follow-up for ${lead.name || 'lead'}`, payload: result });
      } else if (action.action_type === 'prepare_payment_reminder') {
        const orderId = action.entity_id;
        const { data: order } = await supabase.from('orders').select('id,lead_id,customer_name,customer_phone,balance_due,payment_status').eq('id', orderId).eq('business_id', businessId).maybeSingle();
        if (!order) throw new Error('Order no longer exists');
        if (order.payment_status === 'paid' || Number(order.balance_due || 0) <= 0) throw new Error('Order is already paid');
        if (order.lead_id) {
          const { data: task, error } = await supabase.from('follow_up_tasks').insert({ business_id: businessId, lead_id: order.lead_id, task_type: 'message', scheduled_at: new Date().toISOString(), status: 'pending', notes: `Hi ${order.customer_name || ''}! Just a friendly reminder that your outstanding balance is ${Number(order.balance_due || 0)}. Please let us know if you need any help.`, channel: 'whatsapp', automation_generated: true, followup_number: 1 }).select('id').single();
          if (error) throw new Error(error.message);
          result = { task_id: task.id, queued: true };
        } else {
          await supabase.from('notifications').insert({ business_id: businessId, user_id: ctx.user.id, type: 'operator_action', title: 'Payment reminder prepared', message: `Payment reminder prepared for ${order.customer_name || 'customer'}; no linked lead is available for automatic WhatsApp delivery.`, metadata: { order_id: order.id, balance_due: order.balance_due } });
          result = { queued: false, prepared: true };
        }
      } else if (action.action_type === 'inventory_alert') {
        await supabase.from('notifications').insert({ business_id: businessId, user_id: ctx.user.id, type: 'operator_inventory', title: action.title, message: action.description || 'Inventory needs review.', metadata: action.payload || {} });
        result = { notified: true };
      } else {
        throw new Error('Unsupported Operator action');
      }
      await supabase.from('operator_actions').update({ status: 'completed', result, executed_at: new Date().toISOString(), error_message: null }).eq('id', action.id);
      await supabase.from('activity_logs').insert({ business_id: businessId, user_id: ctx.user.id, action: 'operator_action_completed', entity_type: 'operator_action', entity_id: action.id, metadata: result });
      return ok({ action: { ...action, status: 'completed', result } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('operator_actions').update({ status: 'failed', error_message: message, result: {} }).eq('id', action.id);
      return fail(message, 409);
    }
  }

  if (body.action === 'approve') {
    const actionId = String(body.action_id || '').trim();
    const { data, error } = await supabase.from('operator_actions').update({ status: 'approved', approved_by: ctx.user.id, approved_at: new Date().toISOString() }).eq('id', actionId).eq('business_id', businessId).eq('status', 'proposed').select('*').maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail('Action is no longer awaiting approval', 409);
    return ok({ action: data });
  }

  if (body.action === 'scan') {
    const settings = await ensureSettings(supabase, businessId, ctx.user.id);
    const cutoff = new Date(Date.now() - Number(settings?.stale_lead_hours || 24) * 3600000).toISOString();
    const quietCutoff = new Date(Date.now() - Number(settings?.quiet_conversation_hours || 24) * 3600000).toISOString();
    const [leadsRes, tasksRes, ordersRes, appointmentsRes, productsRes, conversationsRes] = await Promise.all([
      supabase.from('leads').select('id,name,phone,status,conversion_amount,conversion_currency,conversation_id,updated_at').eq('business_id', businessId),
      supabase.from('follow_up_tasks').select('id,lead_id,status,scheduled_at').eq('business_id', businessId),
      supabase.from('orders').select('id,lead_id,customer_name,customer_phone,status,total_amount,balance_due,payment_status,currency,updated_at').eq('business_id', businessId),
      supabase.from('appointments').select('id,customer_name,customer_id,lead_id,status,date,start_time,service_price,currency,updated_at').eq('business_id', businessId),
      supabase.from('products').select('id,name,availability,status,price,currency').eq('business_id', businessId).eq('status','active'),
      supabase.from('conversations').select('id,customer_id,status,channel,last_message_at,updated_at,human_takeover').eq('business_id', businessId).eq('status','active'),
    ]);
    const errors = [leadsRes,tasksRes,ordersRes,appointmentsRes,productsRes,conversationsRes].filter(r => r.error);
    if (errors.length) return fail(errors[0].error?.message || 'Business scan failed', 500);
    const leads = leadsRes.data || [], tasks = tasksRes.data || [], orders = ordersRes.data || [], appointments = appointmentsRes.data || [], products = productsRes.data || [], conversations = conversationsRes.data || [];
    const pendingLeadIds = new Set(tasks.filter(t => ['pending','processing','overdue'].includes(t.status)).map(t => t.lead_id).filter(Boolean));
    const staleLeads = leads.filter(l => ['new','contacted','qualified','proposal'].includes(l.status) && l.updated_at < cutoff && !pendingLeadIds.has(l.id));
    const unpaidOrders = orders.filter(o => ['unpaid','partial'].includes(o.payment_status) && Number(o.balance_due || 0) > 0);
    const overdueTasks = tasks.filter(t => ['pending','overdue'].includes(t.status) && t.scheduled_at < new Date().toISOString());
    const cancelledAppointments = appointments.filter(a => a.status === 'cancelled' && a.updated_at >= new Date(Date.now()-48*3600000).toISOString());
    const outOfStock = products.filter(p => ['out_of_stock','limited'].includes(p.availability));
    const quietConversations = conversations.filter(c => c.last_message_at && c.last_message_at < quietCutoff && !c.human_takeover);
    const findings: any[] = [];
    const add = (id:string,title:string,description:string,severity:'high'|'medium'|'low',items:any[],actionType?:string,amount?:number,currency?:string) => { if (!items.length) return; findings.push({ id,title,description,severity,count:items.length,amount,currency,actionType,entityIds:items.map(x=>x.id) }); };
    add('stale-leads','Hot leads are going quiet',`${staleLeads.length} open lead${staleLeads.length===1?'':'s'} has not moved for ${settings.stale_lead_hours}+ hours and has no active follow-up.`, 'high', staleLeads,'create_lead_followup', staleLeads.reduce((s,l)=>s+Number(l.conversion_amount||0),0),'PKR');
    add('unpaid-orders','Payments are still outstanding',`${unpaidOrders.length} order${unpaidOrders.length===1?'':'s'} has a remaining balance.`, 'high', unpaidOrders,'prepare_payment_reminder', unpaidOrders.reduce((s,o)=>s+Number(o.balance_due||0),0),unpaidOrders[0]?.currency||'PKR');
    add('overdue-tasks','Follow-ups are overdue',`${overdueTasks.length} scheduled follow-up task${overdueTasks.length===1?'':'s'} is past due.`, 'medium', overdueTasks);
    add('quiet-conversations','Conversations need attention',`${quietConversations.length} active conversation${quietConversations.length===1?'':'s'} has been quiet for ${settings.quiet_conversation_hours}+ hours.`, 'medium', quietConversations);
    add('cancelled-appointments','Cancelled slots may be recoverable',`${cancelledAppointments.length} appointment${cancelledAppointments.length===1?'':'s'} was cancelled in the last 48 hours.`, 'medium', cancelledAppointments);
    add('inventory','Demand is hitting inventory limits',`${outOfStock.length} active product${outOfStock.length===1?'':'s'} is out of stock or limited.`, 'low', outOfStock,'inventory_alert');
    const actions:any[] = [];
    const mode = settings?.mode || 'review';
    if (mode !== 'review') {
      for (const lead of staleLeads.slice(0,20)) actions.push({ business_id:businessId, action_type:'create_lead_followup', entity_type:'lead', entity_id:lead.id, title:`Recover ${lead.name || 'stale lead'}`, description:'Queue a WhatsApp recovery follow-up.', risk_level:'medium', idempotency_key:`stale-lead:${lead.id}`, payload:{ message:`Hi ${lead.name || ''}! Just checking in to see if you still need any help. 😊` }, status: mode==='autonomous' && settings.auto_followups ? 'approved' : 'proposed' });
      for (const order of unpaidOrders.slice(0,20)) actions.push({ business_id:businessId, action_type:'prepare_payment_reminder', entity_type:'order', entity_id:order.id, title:`Payment reminder for ${order.customer_name || 'customer'}`, description:`Outstanding balance: ${order.balance_due || 0} ${order.currency || 'PKR'}.`, risk_level:'medium', idempotency_key:`payment:${order.id}`, payload:{}, status: mode==='autonomous' && settings.auto_payment_reminders ? 'approved' : 'proposed' });
      for (const product of outOfStock.slice(0,20)) actions.push({ business_id:businessId, action_type:'inventory_alert', entity_type:'product', entity_id:product.id, title:`Inventory alert: ${product.name}`, description:`Product is ${product.availability}.`, risk_level:'low', idempotency_key:`inventory:${product.id}:${product.availability}`, payload:{ product_id:product.id, availability:product.availability }, status:'proposed' });
      if (actions.length) {
        const { error } = await supabase.from('operator_actions').upsert(actions,{onConflict:'business_id,idempotency_key'});
        if (error) return fail(error.message,500);
      }
    }
    const { data: queued } = await supabase.from('operator_actions').select('*').eq('business_id',businessId).in('status',['proposed','approved','executing']).order('created_at',{ascending:false}).limit(50);
    await supabase.from('business_events').insert({ business_id:businessId, event_type:'operator_scan', summary:`Operator scanned the business and found ${findings.length} issue categories`, payload:{ findings, scanned_at:new Date().toISOString() } });
    return ok({ settings, findings, actions:queued || [], recoveredPotential: staleLeads.reduce((s,l)=>s+Number(l.conversion_amount||0),0)+unpaidOrders.reduce((s,o)=>s+Number(o.balance_due||0),0), scannedAt:new Date().toISOString() });
  }

  return fail('Unknown Operator action');
}
