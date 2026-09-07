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

    const { error: subscriptionError } = await supabase.from('business_subscriptions').insert({
      business_id: businessId,
      plan_id: order.plan_id,
      status: 'active',
      billing_cycle: order.billing_cycle,
      start_date: new Date().toISOString(),
      end_date: endDate.toISOString(),
    });
    if (subscriptionError) throw new Error(subscriptionError.message);
  }

  const now = new Date().toISOString();
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