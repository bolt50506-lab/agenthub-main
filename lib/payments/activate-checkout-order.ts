import { createDecipheriv, createHash } from 'crypto';

function decryptPassword(value: string) {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY;
  if (!secret) throw new Error('Checkout encryption is not configured');
  const [ivB64, tagB64, encryptedB64] = String(value || '').split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) throw new Error('Invalid encrypted checkout password');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
}

export async function activateCheckoutOrder(supabase: any, order: any, adminId: string) {
  if (order.status === 'fulfilled' && order.business_id) return { businessId: order.business_id, alreadyFulfilled: true };

  const password = decryptPassword(order.encrypted_password);
  const { data: usersResult, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(usersError.message);

  let user = usersResult?.users?.find((item: any) => item.email?.toLowerCase() === String(order.customer_email).toLowerCase()) || null;
  if (!user) {
    const { data: created, error: userError } = await supabase.auth.admin.createUser({
      email: order.customer_email,
      password,
      email_confirm: true,
      user_metadata: { full_name: order.customer_name },
    });
    if (userError || !created.user) throw new Error(userError?.message || 'Unable to create customer account');
    user = created.user;
  }

  let businessId = order.business_id || null;
  let subscriptionId: string | null = null;
  let subscriptionEnd: string | null = null;
  if (!businessId) {
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: order.business_name,
        subscription_plan_id: order.plan_id,
        subscription_status: 'active',
        subscription_started_at: new Date().toISOString(),
        country: order.country_code,
        status: 'active',
      })
      .select('id')
      .single();
    if (businessError || !business) throw new Error(businessError?.message || 'Unable to create business');
    businessId = business.id;

    await supabase.from('profiles').upsert({
      id: user.id,
      email: order.customer_email,
      full_name: order.customer_name,
      active_business_id: businessId,
      onboarding_completed: false,
    }, { onConflict: 'id' });

    const { error: memberError } = await supabase.from('business_members').upsert({
      business_id: businessId,
      user_id: user.id,
      role: 'owner',
      status: 'active',
    }, { onConflict: 'business_id,user_id' });
    if (memberError) throw new Error(memberError.message);

    const endDate = new Date();
    if (order.billing_cycle === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    const { data: subscription, error: subscriptionError } = await supabase.from('business_subscriptions').insert({
      business_id: businessId,
      plan_id: order.plan_id,
      status: 'active',
      billing_cycle: order.billing_cycle,
      start_date: new Date().toISOString(),
      end_date: endDate.toISOString(),
    }).select('id,end_date').single();
    if (subscriptionError || !subscription) throw new Error(subscriptionError?.message || 'Unable to activate subscription');
    subscriptionId = subscription.id;
    subscriptionEnd = subscription.end_date;
    await supabase.from('businesses').update({ subscription_expires_at: subscription.end_date, subscription_status: 'active' }).eq('id', businessId);
  }

  const now = new Date().toISOString();

  if (!subscriptionId && businessId) {
    const { data: existingSubscription } = await supabase.from('business_subscriptions')
      .select('id,end_date').eq('business_id', businessId).maybeSingle();
    subscriptionId = existingSubscription?.id || null;
    subscriptionEnd = existingSubscription?.end_date || null;
  }

  if (businessId) {
    const invoiceNumber = 'INV-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(order.order_number || order.id).replace(/[^A-Za-z0-9]/g,'').slice(-10).toUpperCase();
    const { data: invoice } = await supabase.from('subscription_invoices')
      .upsert({
        business_id: businessId,
        subscription_id: subscriptionId,
        invoice_number: invoiceNumber,
        billing_period_start: now,
        billing_period_end: subscriptionEnd,
        amount: Number(order.amount_cents || 0) / 100,
        currency: order.currency || 'USD',
        status: 'paid',
        due_date: now,
        paid_at: now,
        checkout_order_id: order.id,
        metadata: { order_number: order.order_number, billing_cycle: order.billing_cycle, plan_id: order.plan_id },
      }, { onConflict: 'invoice_number' })
      .select('id,invoice_number').maybeSingle();

    const receiptNumber = 'SUB-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(order.order_number || order.id).replace(/[^A-Za-z0-9]/g,'').slice(-8).toUpperCase();
    const { data: receipt, error: receiptError } = await supabase.from('payment_receipts').upsert({
      business_id: businessId,
      receipt_number: receiptNumber,
      subscription_invoice_id: invoice?.id || null,
      customer_name: order.customer_name,
      customer_contact: order.whatsapp_number || order.customer_email,
      channel: 'subscription',
      amount: Number(order.amount_cents || 0) / 100,
      currency: order.currency || 'USD',
      issued_at: now,
      payload: {
        type: 'agenthub_subscription',
        order_number: order.order_number,
        invoice_number: invoice?.invoice_number || invoiceNumber,
        business_name: order.business_name,
        customer_name: order.customer_name,
        customer_contact: order.whatsapp_number || order.customer_email,
        plan_id: order.plan_id,
        amount: Number(order.amount_cents || 0) / 100,
        currency: order.currency || 'USD',
        issued_at: now,
        valid_until: subscriptionEnd,
      },
    }, { onConflict: 'business_id,receipt_number' })
      .select('id,receipt_number').maybeSingle();
    if (receiptError) throw new Error(receiptError.message);

    const { data: proof } = await supabase.from('payment_verifications')
      .select('channel,sender_phone,metadata').eq('order_id', order.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const recipientChannel = proof?.channel || 'whatsapp';
    const recipientAddress = proof?.sender_phone || order.whatsapp_number || null;
    if (recipientAddress) {
      await supabase.from('channel_notifications').insert({
        business_id: businessId,
        recipient_channel: recipientChannel,
        recipient_address: recipientAddress,
        template_type: 'subscription_payment_receipt',
        payload: {
          receipt_id: receipt?.id || null,
          receipt_number: receiptNumber,
          invoice_number: invoice?.invoice_number || invoiceNumber,
          amount: Number(order.amount_cents || 0) / 100,
          currency: order.currency || 'USD',
          business_name: order.business_name,
          customer_name: order.customer_name,
          customer_contact: order.whatsapp_number || order.customer_email,
          plan_id: order.plan_id,
          valid_until: subscriptionEnd,
          issued_at: now,
          message: 'Payment approved. Your AgentHub subscription is active. Your payment receipt is attached below.',
        },
      });
    }
  }

  const { error: orderError } = await supabase
    .from('public_checkout_orders')
    .update({
      status: 'fulfilled',
      business_id: businessId,
      fulfilled_at: now,
      reviewed_at: now,
      reviewed_by: adminId,
      rejection_reason: null,
    })
    .eq('id', order.id);
  if (orderError) throw new Error(orderError.message);

  return { businessId, userId: user.id, alreadyFulfilled: false };
}
