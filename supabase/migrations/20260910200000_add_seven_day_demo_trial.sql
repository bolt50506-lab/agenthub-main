-- Seven-day self-service demo trial.
-- New demo workspaces receive full feature access during the trial.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_businesses_trial_ends_at
  ON public.businesses(trial_ends_at);

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_trial_ends_at
  ON public.business_subscriptions(trial_ends_at);

-- During an active trial, the normal paid-plan limits are bypassed so the
-- customer can test the complete AgentHub feature set. Once the trial ends,
-- the normal assigned plan limits apply again (and the dashboard is locked).
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_business_id uuid,
  p_limit_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_max integer;
  v_current integer := 0;
  v_trial_ends_at timestamptz;
  v_subscription_status text;
BEGIN
  SELECT b.subscription_plan_id, b.trial_ends_at, b.subscription_status
    INTO v_plan_id, v_trial_ends_at, v_subscription_status
  FROM public.businesses b
  WHERE b.id = p_business_id;

  SELECT COALESCE(v_trial_ends_at, bs.trial_ends_at),
         COALESCE(v_subscription_status, bs.status)
    INTO v_trial_ends_at, v_subscription_status
  FROM public.business_subscriptions bs
  WHERE bs.business_id = p_business_id;

  IF v_subscription_status = 'trial'
     AND v_trial_ends_at IS NOT NULL
     AND v_trial_ends_at >= now() THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current', 0,
      'max', -1,
      'limit_type', p_limit_type,
      'trial', true,
      'trial_ends_at', v_trial_ends_at
    );
  END IF;

  IF v_plan_id IS NULL THEN
    SELECT bs.plan_id INTO v_plan_id
    FROM public.business_subscriptions bs
    WHERE bs.business_id = p_business_id;
  END IF;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'current', 0, 'max', 0, 'limit_type', p_limit_type, 'error', 'No plan assigned');
  END IF;

  SELECT CASE p_limit_type
    WHEN 'max_agents' THEN sp.max_agents
    WHEN 'max_conversations' THEN sp.max_conversations
    WHEN 'max_team_members' THEN sp.max_team_members
    WHEN 'max_leads' THEN sp.max_leads
    WHEN 'max_appointments' THEN sp.max_appointments
    WHEN 'max_knowledge_items' THEN sp.max_knowledge_items
    WHEN 'max_products' THEN sp.max_products
    WHEN 'max_media_documents' THEN sp.max_media_documents
    WHEN 'max_integrations' THEN sp.max_integrations
    WHEN 'max_voice_clones' THEN sp.max_voice_clones
    WHEN 'max_ai_usage_per_month' THEN sp.max_ai_usage_per_month
    ELSE NULL
  END INTO v_max
  FROM public.subscription_plans sp
  WHERE sp.id = v_plan_id;

  IF p_limit_type = 'max_conversations' THEN
    SELECT count(*)::integer INTO v_current
    FROM public.conversations c
    WHERE c.business_id = p_business_id
      AND c.created_at >= date_trunc('month', now());
  ELSIF p_limit_type = 'max_ai_usage_per_month' THEN
    SELECT count(*)::integer INTO v_current
    FROM public.messages m
    WHERE m.business_id = p_business_id
      AND m.sender_type = 'agent'
      AND m.created_at >= date_trunc('month', now());
  ELSE
    CASE p_limit_type
      WHEN 'max_agents' THEN SELECT count(*)::integer INTO v_current FROM public.agents WHERE business_id = p_business_id;
      WHEN 'max_team_members' THEN SELECT count(*)::integer INTO v_current FROM public.business_members WHERE business_id = p_business_id AND status = 'active';
      WHEN 'max_leads' THEN SELECT count(*)::integer INTO v_current FROM public.leads WHERE business_id = p_business_id;
      WHEN 'max_appointments' THEN SELECT count(*)::integer INTO v_current FROM public.appointments WHERE business_id = p_business_id;
      WHEN 'max_knowledge_items' THEN SELECT count(*)::integer INTO v_current FROM public.knowledge_items WHERE business_id = p_business_id;
      WHEN 'max_products' THEN SELECT count(*)::integer INTO v_current FROM public.products WHERE business_id = p_business_id;
      WHEN 'max_media_documents' THEN SELECT count(*)::integer INTO v_current FROM public.media_documents WHERE business_id = p_business_id;
      WHEN 'max_integrations' THEN SELECT count(*)::integer INTO v_current FROM public.integrations WHERE business_id = p_business_id;
      WHEN 'max_voice_clones' THEN SELECT count(*)::integer INTO v_current FROM public.voice_profiles WHERE business_id = p_business_id;
      ELSE RETURN jsonb_build_object('allowed', false, 'current', 0, 'max', 0, 'limit_type', p_limit_type, 'error', 'Unknown limit type');
    END CASE;
  END IF;

  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'current', v_current, 'max', -1, 'limit_type', p_limit_type);
  END IF;

  RETURN jsonb_build_object('allowed', v_current < v_max, 'current', v_current, 'max', v_max, 'limit_type', p_limit_type);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) TO authenticated;
