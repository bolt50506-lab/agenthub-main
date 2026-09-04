import { supabase } from '@/lib/supabase/client';
import type { SubscriptionPlan, BusinessSubscription } from '@/lib/types/database';

export type PlanLimitType =
  | 'max_agents'
  | 'max_team_members'
  | 'max_leads'
  | 'max_appointments'
  | 'max_knowledge_items'
  | 'max_products'
  | 'max_media_documents'
  | 'max_integrations'
  | 'max_voice_clones';

export interface PlanLimitResult {
  allowed: boolean;
  current: number;
  max: number;
  limit_type: string;
  error?: string;
}

export async function checkPlanLimit(
  businessId: string,
  limitType: PlanLimitType
): Promise<PlanLimitResult> {
  const { data, error } = await supabase.rpc('check_plan_limit', {
    p_business_id: businessId,
    p_limit_type: limitType,
  });

  if (error) {
    return { allowed: false, current: 0, max: 0, limit_type: limitType, error: error.message };
  }

  return data as PlanLimitResult;
}

export async function getBusinessSubscription(businessId: string): Promise<BusinessSubscription | null> {
  const { data, error } = await supabase
    .from('business_subscriptions')
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) return null;

  const sub = data as Record<string, unknown>;
  return {
    id: sub.id as string,
    business_id: sub.business_id as string,
    plan_id: sub.plan_id as string,
    status: sub.status as BusinessSubscription['status'],
    billing_cycle: sub.billing_cycle as BusinessSubscription['billing_cycle'],
    start_date: sub.start_date as string,
    end_date: sub.end_date as string | null,
    created_at: sub.created_at as string,
    updated_at: sub.updated_at as string,
    plan: sub.plan as SubscriptionPlan | null,
  };
}

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trial';
}

export function isSubscriptionSuspended(status: string | null | undefined): boolean {
  return status === 'suspended';
}

export function isSubscriptionExpired(status: string | null | undefined): boolean {
  return status === 'expired';
}

export function isSubscriptionCancelled(status: string | null | undefined): boolean {
  return status === 'cancelled';
}

export function getSubscriptionBlockedMessage(status: string | null | undefined): string | null {
  if (isSubscriptionSuspended(status)) {
    return 'Your business account has been suspended. Please contact the platform administrator.';
  }
  if (isSubscriptionExpired(status)) {
    return 'Your subscription has expired. Please contact the platform administrator.';
  }
  if (isSubscriptionCancelled(status)) {
    return 'Your subscription has been cancelled. Please contact the platform administrator.';
  }
  return null;
}
