
import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv, createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function decryptPassword(payload: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const [iv64, tag64, encrypted64] = payload.split('.');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function POST(req: NextRequest) {
  const merchantSecret = process.env.PAYNICORN_APP_SECRET || process.env.PAYNICORN_MERCHANT_SECRET;
  if (!merchantSecret) return new NextResponse('gateway not configured', { status: 503 });

  try {
    const payload = await req.json();
    if (!payload?.content || !payload?.sign) return new NextResponse('invalid callback', { status: 400 });

    const expected = createHash('md5').update(payload.content + merchantSecret).digest('hex');
    if (expected !== payload.sign) return new NextResponse('invalid signature', { status: 401 });

    const event = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
    const orderNumber = event.orderId;
    const txnId = event.txnId;

    if (!orderNumber) return new NextResponse('missing order', { status: 400 });

    const supabase = createServiceClient();
    const { data: order } = await supabase
      .from('public_checkout_orders')
      .select('*, plan:subscription_plans(*)')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (!order) return new NextResponse('order not found', { status: 404 });

    if (order.status === 'fulfilled') {
      return new NextResponse(`success_${txnId || order.gateway_transaction_id || 'already'}`, { status: 200 });
    }

    if (String(event.status) !== '1') {
      await supabase.from('public_checkout_orders')
        .update({ status: event.status === '0' ? 'failed' : 'pending', gateway_transaction_id: txnId || order.gateway_transaction_id })
        .eq('id', order.id);
      return new NextResponse(`success_${txnId || 'received'}`, { status: 200 });
    }

    await supabase.from('public_checkout_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), gateway_transaction_id: txnId || order.gateway_transaction_id })
      .eq('id', order.id);

    let userId = order.user_id;
    let businessId = order.business_id;

    if (!userId) {
      const password = decryptPassword(order.encrypted_password);
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: order.customer_email,
        password,
        email_confirm: true,
        user_metadata: { full_name: order.customer_name },
      });

      if (authError || !authData.user) {
        await supabase.from('public_checkout_orders').update({ status: 'paid' }).eq('id', order.id);
        throw new Error(authError?.message || 'Unable to create customer account');
      }
      userId = authData.user.id;
    }

    if (!businessId) {
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .insert({
          name: order.business_name,
          country: order.country_code,
          subscription_plan_id: order.plan_id,
          subscription_status: 'active',
          subscription_started_at: new Date().toISOString(),
          status: 'active',
        })
        .select('id')
        .single();

      if (businessError || !business) throw new Error(businessError?.message || 'Unable to create business workspace');
      businessId = business.id;

      const { error: memberError } = await supabase.from('business_members').insert({
        business_id: businessId,
        user_id: userId,
        role: 'owner',
        status: 'active',
      });
      if (memberError) throw new Error(memberError.message);

      await supabase.from('profiles').update({
        active_business_id: businessId,
        full_name: order.customer_name,
      }).eq('id', userId);

      await supabase.from('business_subscriptions').insert({
        business_id: businessId,
        plan_id: order.plan_id,
        status: 'active',
        billing_cycle: order.billing_cycle,
        start_date: new Date().toISOString(),
      });

      await supabase.from('ai_provider_settings').insert({ business_id: businessId }).select().maybeSingle();
      await supabase.from('group_rules').insert({ business_id: businessId }).select().maybeSingle();

      await supabase.from('integrations').insert([
        { business_id: businessId, type: 'whatsapp', name: 'WhatsApp', status: 'not_connected' },
        { business_id: businessId, type: 'website_chat', name: 'Website Chat', status: 'not_connected' },
        { business_id: businessId, type: 'facebook_messenger', name: 'Facebook Messenger', status: 'not_connected' },
        { business_id: businessId, type: 'instagram', name: 'Instagram', status: 'not_connected' },
      ]);
    }

    await supabase.from('public_checkout_orders').update({
      status: 'fulfilled',
      user_id: userId,
      business_id: businessId,
      fulfilled_at: new Date().toISOString(),
    }).eq('id', order.id);

    return new NextResponse(`success_${txnId || 'fulfilled'}`, { status: 200 });
  } catch (error) {
    console.error('[Paynicorn webhook] Failed:', error);
    return new NextResponse('processing failed', { status: 500 });
  }
}
