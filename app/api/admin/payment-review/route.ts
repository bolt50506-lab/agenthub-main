import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv, createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function decryptPassword(value: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const [ivB64, tagB64, dataB64] = String(value || '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Stored signup password is invalid');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

async function requireSuperAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('AUTH:Authentication required.');
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('AUTH:Invalid authentication.');
  const { data: profile } = await supabase.from('profiles').select('is_super_admin').eq('id', data.user.id).maybeSingle();
  if (!profile?.is_super_admin) throw new Error('FORBIDDEN:Only a super admin can approve AgentHub signup payments.');
  return { supabase, userId: data.user.id };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(req);
    const { data, error } = await supabase.from('public_checkout_orders')
      .select('id,order_number,plan_id,billing_cycle,customer_name,customer_email,business_name,country_code,currency,amount_cents,payment_method,payment_screenshot_path,payment_reference,status,submitted_at,rejection_reason,created_at,subscription_plans(name,slug)')
      .in('status',['pending_review','rejected']).order('submitted_at',{ascending:false});
    if (error) throw error;
    const rows = [];
    for (const row of data || []) {
      let screenshotUrl: string | null = null;
      if (row.payment_screenshot_path) {
        const signed = await supabase.storage.from('payment-proofs').createSignedUrl(row.payment_screenshot_path, 900);
        screenshotUrl = signed.data?.signedUrl || null;
      }
      rows.push({ ...row, screenshotUrl });
    }
    return NextResponse.json({ orders: rows });
  } catch (error) {
    const message=error instanceof Error ? error.message : 'Unable to load payment reviews.';
    return NextResponse.json({error:message.replace(/^(AUTH:|FORBIDDEN:)/,'')},{status:message.startsWith('AUTH:')?401:message.startsWith('FORBIDDEN:')?403:500});
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, userId } = await requireSuperAdmin(req);
    const body=await req.json();
    const orderId=String(body.orderId||'');
    const action=body.action==='approve'?'approve':body.action==='reject'?'reject':'';
    const reason=String(body.reason||'').trim();
    if(!orderId||!action) return NextResponse.json({error:'Order and review action are required.'},{status:400});

    const {data:order,error:orderError}=await supabase.from('public_checkout_orders').select('*').eq('id',orderId).maybeSingle();
    if(orderError||!order) return NextResponse.json({error:'Payment order not found.'},{status:404});
    if(order.status!=='pending_review' && !(action==='reject'&&order.status==='rejected')) return NextResponse.json({error:'This payment is not awaiting review.'},{status:409});

    if(action==='reject'){
      await supabase.from('public_checkout_orders').update({status:'rejected',reviewed_at:new Date().toISOString(),reviewed_by:userId,rejection_reason:reason||'Payment proof could not be verified.',updated_at:new Date().toISOString()}).eq('id',order.id);
      return NextResponse.json({ok:true,status:'rejected'});
    }

    if(!order.encrypted_password || !order.customer_email) return NextResponse.json({error:'This order is missing signup credentials and cannot be activated automatically.'},{status:422});
    const password=decryptPassword(order.encrypted_password);
    let userIdForBusiness: string | null = null;

    const {data:existingProfile}=await supabase.from('profiles').select('id').eq('email',order.customer_email).maybeSingle();
    if(existingProfile?.id){
      userIdForBusiness=existingProfile.id;
      await supabase.auth.admin.updateUserById(userIdForBusiness,{password,email_confirm:true,user_metadata:{full_name:order.customer_name,phone:order.whatsapp_number||null}});
    } else {
      const created=await supabase.auth.admin.createUser({email:order.customer_email,password,email_confirm:true,user_metadata:{full_name:order.customer_name,phone:order.whatsapp_number||null}});
      if(created.error||!created.user) return NextResponse.json({error:created.error?.message||'Unable to create the customer account.'},{status:500});
      userIdForBusiness=created.user.id;
    }

    let businessId=order.business_id as string|null;
    if(!businessId){
      const createdBusiness=await supabase.from('businesses').insert({
        name:order.business_name,phone:order.whatsapp_number||null,country:order.country_code||'PK',
        status:'active',subscription_plan_id:order.plan_id,subscription_status:'active',subscription_started_at:new Date().toISOString()
      }).select('id').single();
      if(createdBusiness.error||!createdBusiness.data) return NextResponse.json({error:createdBusiness.error?.message||'Unable to create the customer workspace.'},{status:500});
      businessId=createdBusiness.data.id;
    } else {
      await supabase.from('businesses').update({subscription_plan_id:order.plan_id,subscription_status:'active',subscription_started_at:new Date().toISOString(),status:'active'}).eq('id',businessId);
    }

    const member=await supabase.from('business_members').upsert({business_id:businessId,user_id:userIdForBusiness,role:'owner',status:'active'},{onConflict:'business_id,user_id'});
    if(member.error) return NextResponse.json({error:'Account was created but business membership failed: '+member.error.message},{status:500});

    const start=new Date();
    const end=new Date(start);
    if(order.billing_cycle==='yearly') end.setFullYear(end.getFullYear()+1); else end.setMonth(end.getMonth()+1);
    const existingSub=await supabase.from('business_subscriptions').select('id').eq('business_id',businessId).maybeSingle();
    const subPayload={business_id:businessId,plan_id:order.plan_id,status:'active',billing_cycle:order.billing_cycle,start_date:start.toISOString(),end_date:end.toISOString()};
    if(existingSub.data?.id) await supabase.from('business_subscriptions').update(subPayload).eq('id',existingSub.data.id);
    else await supabase.from('business_subscriptions').insert(subPayload);

    await supabase.from('profiles').update({active_business_id:businessId,phone:order.whatsapp_number||null,full_name:order.customer_name,onboarding_completed:true}).eq('id',userIdForBusiness);
    await supabase.from('public_checkout_orders').update({status:'fulfilled',business_id:businessId,reviewed_at:new Date().toISOString(),reviewed_by:userId,fulfilled_at:new Date().toISOString(),rejection_reason:null,updated_at:new Date().toISOString()}).eq('id',order.id);

    return NextResponse.json({ok:true,status:'fulfilled',businessId,email:order.customer_email});
  } catch(error) {
    const message=error instanceof Error?error.message:'Unable to approve payment.';
    return NextResponse.json({error:message.replace(/^(AUTH:|FORBIDDEN:)/,'')},{status:message.startsWith('AUTH:')?401:message.startsWith('FORBIDDEN:')?403:500});
  }
}
