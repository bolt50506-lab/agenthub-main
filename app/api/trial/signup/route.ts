import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const TRIAL_DAYS = 7;

function normalizeWhatsApp(value: unknown) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits || null;
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  let createdUserId: string | null = null;
  let createdBusinessId: string | null = null;

  try {
    const body = await req.json();
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const businessName = String(body.businessName || '').trim();
    const password = String(body.password || '');
    const phone = normalizeWhatsApp(body.phone);

    if (!fullName || !email || !businessName || password.length < 8) {
      return NextResponse.json({ error: 'Please enter your name, business name, email, and a password of at least 8 characters.' }, { status: 400 });
    }
    if (!phone || phone.length < 8 || phone.length > 15) {
      return NextResponse.json({ error: 'Please enter a valid WhatsApp number.' }, { status: 400 });
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ error: 'An AgentHub account already exists for this email. Please sign in instead.' }, { status: 409 });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (userError || !userData.user) {
      return NextResponse.json({ error: userError?.message || 'Unable to create your account.' }, { status: 400 });
    }
    createdUserId = userData.user.id;

    const trialStarted = new Date();
    const trialEnds = new Date(trialStarted.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const { data: enterprisePlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('slug', 'enterprise')
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !enterprisePlan) throw new Error('Trial configuration is unavailable.');

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        phone,
        timezone: 'Asia/Karachi',
        status: 'active',
        subscription_plan_id: enterprisePlan.id,
        subscription_status: 'trial',
        subscription_started_at: trialStarted.toISOString(),
        trial_started_at: trialStarted.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      })
      .select('id')
      .single();

    if (businessError || !business) throw new Error(businessError?.message || 'Unable to create your workspace.');
    createdBusinessId = business.id;

    const { error: memberError } = await supabase.from('business_members').insert({
      business_id: business.id,
      user_id: createdUserId,
      role: 'owner',
      status: 'active',
    });
    if (memberError) throw new Error(memberError.message);

    const { error: profileError } = await supabase.from('profiles').update({
      full_name: fullName,
      phone,
      active_business_id: business.id,
      onboarding_completed: false,
    }).eq('id', createdUserId);
    if (profileError) throw new Error(profileError.message);

    const { error: subscriptionError } = await supabase.from('business_subscriptions').insert({
      business_id: business.id,
      plan_id: enterprisePlan.id,
      status: 'trial',
      billing_cycle: 'monthly',
      start_date: trialStarted.toISOString(),
      end_date: trialEnds.toISOString(),
      trial_started_at: trialStarted.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
    });
    if (subscriptionError) throw new Error(subscriptionError.message);

    await supabase.from('ai_provider_settings').upsert({ business_id: business.id }, { onConflict: 'business_id' });
    await supabase.from('group_rules').upsert({ business_id: business.id }, { onConflict: 'business_id' });
    await supabase.from('integrations').insert([
      { business_id: business.id, type: 'whatsapp', name: 'WhatsApp', status: 'not_connected' },
      { business_id: business.id, type: 'website_chat', name: 'Website Chat', status: 'not_connected' },
      { business_id: business.id, type: 'facebook_messenger', name: 'Facebook Messenger', status: 'not_connected' },
      { business_id: business.id, type: 'instagram', name: 'Instagram', status: 'not_connected' },
      { business_id: business.id, type: 'linkedin', name: 'LinkedIn', status: 'not_connected' },
    ]);

    return NextResponse.json({ success: true, trialDays: TRIAL_DAYS, trialEndsAt: trialEnds.toISOString(), email });
  } catch (error) {
    if (createdBusinessId) await supabase.from('businesses').delete().eq('id', createdBusinessId);
    if (createdUserId) await supabase.auth.admin.deleteUser(createdUserId);
    console.error('[Trial Signup] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start your free trial.' }, { status: 500 });
  }
}
