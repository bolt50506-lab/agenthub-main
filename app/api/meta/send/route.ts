async function hasActiveSubscription(supabase: any, businessId: string) {
  const { data: business } = await supabase.from('businesses').select('is_platform_business').eq('id', businessId).maybeSingle();
  if (business?.is_platform_business) return true;
  const { data: sub } = await supabase.from('business_subscriptions').select('status,end_date,overdue_grace_ends_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return false;
  const now = Date.now();
  return ((sub.status === 'active' || sub.status === 'trial') && (!sub.end_date || new Date(sub.end_date).getTime() > now))
    || (sub.status === 'overdue' && sub.overdue_grace_ends_at && new Date(sub.overdue_grace_ends_at).getTime() > now);
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const businessId = String(body.business_id || '');
    const conversationId = String(body.conversation_id || '');
    const message = String(body.message || '').trim();
    if (!businessId || !conversationId || !message) return NextResponse.json({ success: false, error: 'business_id, conversation_id and message are required' }, { status: 400 });

    const supabase = createServiceClient();
    if (!(await hasActiveSubscription(supabase, business_id))) return NextResponse.json({ success: false, error: 'Subscription inactive or expired' }, { status: 402 });
    const { data: conversation } = await supabase.from('conversations').select('id,business_id,customer_id,channel').eq('id', conversationId).eq('business_id', businessId).maybeSingle();
    if (!conversation || !['facebook_messenger','instagram'].includes(conversation.channel)) return NextResponse.json({ success: false, error: 'Meta social conversation not found' }, { status: 404 });
    const { data: customer } = await supabase.from('customers').select('external_id').eq('id', conversation.customer_id).maybeSingle();
    const recipient = String(customer?.external_id || '').replace(/^(facebook_messenger|instagram):/, '');
    if (!recipient) return NextResponse.json({ success: false, error: 'Customer social ID is missing' }, { status: 400 });

    const { data: integration } = await supabase.from('integrations').select('config').eq('business_id', businessId).eq('type', conversation.channel).eq('status','connected').maybeSingle();
    const cfg = (integration?.config || {}) as Record<string, any>;
    const token = String(conversation.channel === 'facebook_messenger' ? cfg.page_access_token : cfg.access_token || '');
    const baseId = String(conversation.channel === 'facebook_messenger' ? cfg.page_id : cfg.instagram_account_id || '');
    if (!token || !baseId) return NextResponse.json({ success: false, error: 'Meta channel credentials are not connected' }, { status: 409 });

    const url = conversation.channel === 'facebook_messenger'
      ? 'https://graph.facebook.com/' + META_VERSION + '/me/messages'
      : 'https://graph.facebook.com/' + META_VERSION + '/' + encodeURIComponent(baseId) + '/messages';
    const payload = conversation.channel === 'facebook_messenger'
      ? { recipient: { id: recipient }, messaging_type: 'RESPONSE', message: { text: message } }
      : { recipient: { id: recipient }, message: { text: message } };

    const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.error) return NextResponse.json({success:false,error:data?.error?.message||'Meta could not send the message'},{status:502});

    const now=new Date().toISOString();
    const {error:insertError}=await supabase.from('messages').insert({business_id:businessId,conversation_id:conversationId,sender_type:'business',content:message,content_type:'text',is_inbound:false,metadata:{provider:conversation.channel,recipient_id:recipient,human_takeover:true}});
    if(insertError) console.error('Social human message sent but not recorded:',insertError.message);
    await supabase.from('conversations').update({human_takeover:true,ai_enabled:false,human_takeover_at:now,ai_resume_at:new Date(Date.now()+2*60*1000).toISOString(),last_message_at:now,updated_at:now}).eq('id',conversationId).eq('business_id',businessId);
    return NextResponse.json({success:true,mode:'human'});
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof Error?error.message:'Internal server error'},{status:500});
  }
}
