import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const secret = process.env.BUSINESS_ANALYZER_CRON_SECRET || process.env.FOLLOWUP_CRON_SECRET || process.env.CRON_SECRET || '';
  return Boolean(secret && token === secret);
}

async function propose(supabase: any, businessId: string, item: {
  action_type: string; entity_type: string; entity_id: string; title: string; description: string; risk_level?: string; payload?: any;
}) {
  const idempotencyKey = 'analyzer:' + item.action_type + ':' + item.entity_id;
  const { data: existing } = await supabase.from('operator_actions').select('id,status').eq('business_id', businessId).eq('idempotency_key', idempotencyKey).in('status', ['proposed','approved','executing']).limit(1).maybeSingle();
  if (existing) return false;
  const { error } = await supabase.from('operator_actions').insert({
    business_id: businessId,
    action_type: item.action_type,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    title: item.title,
    description: item.description,
    status: 'proposed',
    risk_level: item.risk_level || 'low',
    idempotency_key: idempotencyKey,
    payload: item.payload || {},
  });
  if (error) { console.error('Analyzer action insert failed:', error.message); return false; }
  return true;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const now = new Date();
  const { data: businesses, error: businessError } = await supabase.from('businesses').select('id,status').eq('status','active');
  if (businessError) return NextResponse.json({ error: businessError.message }, { status: 500 });

  let proposed = 0;
  const summary: Record<string, number> = {};

  for (const business of businesses || []) {
    const { data: settings } = await supabase.from('operator_settings').select('stale_lead_hours,quiet_conversation_hours,inventory_alerts').eq('business_id',business.id).maybeSingle();
    const staleHours = Number(settings?.stale_lead_hours || 24);
    const quietHours = Number(settings?.quiet_conversation_hours || 24);

    const staleCutoff = new Date(now.getTime() - staleHours * 3600000).toISOString();
    const quietCutoff = new Date(now.getTime() - quietHours * 3600000).toISOString();

    const { data: leads } = await supabase.from('leads').select('id,name,status,interested_product,updated_at,phone').eq('business_id',business.id).in('status',['new','contacted','qualified','negotiating']).lt('updated_at',staleCutoff).order('updated_at',{ascending:true}).limit(50);
    for (const lead of leads || []) {
      if (await propose(supabase,business.id,{action_type:'follow_up_stale_lead',entity_type:'lead',entity_id:lead.id,title:'Follow up with stale lead: '+(lead.name || lead.phone || 'Customer'),description:'This lead has had no update for '+staleHours+'+ hours. Review the conversation and follow up with a relevant message.',payload:{lead_id:lead.id}})) { proposed++; summary.stale_leads=(summary.stale_leads||0)+1; }
    }

    const { data: conversations } = await supabase.from('conversations').select('id,title,channel,last_message_at,customer_id,human_takeover').eq('business_id',business.id).eq('status','active').eq('human_takeover',false).lt('last_message_at',quietCutoff).order('last_message_at',{ascending:true}).limit(50);
    for (const conversation of conversations || []) {
      if (await propose(supabase,business.id,{action_type:'review_quiet_conversation',entity_type:'conversation',entity_id:conversation.id,title:'Review quiet '+conversation.channel+' conversation',description:'No customer activity has been recorded for '+quietHours+'+ hours. Check whether a follow-up or human intervention is appropriate.',payload:{conversation_id:conversation.id,channel:conversation.channel}})) { proposed++; summary.quiet_conversations=(summary.quiet_conversations||0)+1; }
    }

    const { data: unpaid } = await supabase.from('public_checkout_orders').select('id,order_number,customer_name,status,amount_cents,created_at').eq('business_id',business.id).in('status',['pending_payment','rejected']).lt('created_at',staleCutoff).limit(50);
    for (const order of unpaid || []) {
      if (await propose(supabase,business.id,{action_type:'payment_recovery',entity_type:'public_checkout_order',entity_id:order.id,title:'Payment recovery: '+(order.order_number || order.customer_name || 'Order'),description:'A checkout order has remained unpaid/rejected beyond the configured stale threshold. Review payment status before contacting the customer.',risk_level:'medium',payload:{order_id:order.id,amount_cents:order.amount_cents,status:order.status}})) { proposed++; summary.payment_recovery=(summary.payment_recovery||0)+1; }
    }

    const { data: overdue } = await supabase.from('follow_up_tasks').select('id,task_type,scheduled_at,lead_id,conversation_id').eq('business_id',business.id).in('status',['pending','processing']).lt('scheduled_at',now.toISOString()).limit(50);
    for (const task of overdue || []) {
      if (await propose(supabase,business.id,{action_type:'review_overdue_task',entity_type:'follow_up_task',entity_id:task.id,title:'Review overdue follow-up task',description:'A follow-up task is past its scheduled time and needs delivery or recovery.',payload:{task_id:task.id}})) { proposed++; summary.overdue_tasks=(summary.overdue_tasks||0)+1; }
    }

    const { data: appointments } = await supabase.from('appointments').select('id,customer_name,date,start_time,status,payment_status').eq('business_id',business.id).eq('status','scheduled').lt('date',now.toISOString().slice(0,10)).limit(50);
    for (const appointment of appointments || []) {
      if (await propose(supabase,business.id,{action_type:'appointment_recovery',entity_type:'appointment',entity_id:appointment.id,title:'Recover missed appointment: '+(appointment.customer_name || 'Customer'),description:'A scheduled appointment is now in the past but is still marked scheduled. Review and reschedule or close it.',risk_level:'medium',payload:{appointment_id:appointment.id}})) { proposed++; summary.appointment_recovery=(summary.appointment_recovery||0)+1; }
    }

    await supabase.from('business_events').insert({business_id:business.id,event_type:'business_analyzer_scan',entity_type:'business',entity_id:business.id,summary:'Business Analyzer scan completed',payload:{proposed_actions:proposed,summary},source:'business_analyzer'});
  }

  return NextResponse.json({ok:true,scanned_businesses:(businesses||[]).length,proposed_actions:proposed,summary});
}
