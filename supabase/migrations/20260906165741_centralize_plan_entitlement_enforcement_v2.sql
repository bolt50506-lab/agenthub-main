-- Centralized, database-enforced subscription entitlements.
-- The database is the final authority; UI checks are only for UX.

UPDATE public.subscription_plans SET max_agents = 1 WHERE slug = 'starter';

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
BEGIN
  SELECT b.subscription_plan_id INTO v_plan_id
  FROM public.businesses b WHERE b.id = p_business_id;

  IF v_plan_id IS NULL THEN
    SELECT bs.plan_id INTO v_plan_id
    FROM public.business_subscriptions bs WHERE bs.business_id = p_business_id;
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
  FROM public.subscription_plans sp WHERE sp.id = v_plan_id;

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

CREATE OR REPLACE FUNCTION public.enforce_plan_limit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid := NEW.business_id;
  v_limit_type text := TG_ARGV[0];
  v_check jsonb;
  v_is_super_admin boolean := false;
BEGIN
  SELECT COALESCE(p.is_super_admin, false) INTO v_is_super_admin
  FROM public.profiles p WHERE p.id = auth.uid();

  IF v_is_super_admin THEN RETURN NEW; END IF;

  PERFORM 1 FROM public.businesses WHERE id = v_business_id FOR UPDATE;
  v_check := public.check_plan_limit(v_business_id, v_limit_type);

  IF COALESCE((v_check->>'error') <> '', false) THEN
    RAISE EXCEPTION 'PLAN_LIMIT_ERROR: %', v_check->>'error' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE((v_check->>'allowed')::boolean, false) = false THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: % currently uses % of the allowed %.', v_limit_type, COALESCE(v_check->>'current','0'), COALESCE(v_check->>'max','0') USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_plan_limit_trigger() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_agents_plan_limit ON public.agents;
CREATE TRIGGER enforce_agents_plan_limit BEFORE INSERT ON public.agents FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_agents');

DROP TRIGGER IF EXISTS enforce_team_members_plan_limit ON public.business_members;
CREATE TRIGGER enforce_team_members_plan_limit BEFORE INSERT ON public.business_members FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_team_members');

DROP TRIGGER IF EXISTS enforce_leads_plan_limit ON public.leads;
CREATE TRIGGER enforce_leads_plan_limit BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_leads');

DROP TRIGGER IF EXISTS enforce_appointments_plan_limit ON public.appointments;
CREATE TRIGGER enforce_appointments_plan_limit BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_appointments');

DROP TRIGGER IF EXISTS enforce_knowledge_items_plan_limit ON public.knowledge_items;
CREATE TRIGGER enforce_knowledge_items_plan_limit BEFORE INSERT ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_knowledge_items');

DROP TRIGGER IF EXISTS enforce_products_plan_limit ON public.products;
CREATE TRIGGER enforce_products_plan_limit BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_products');

DROP TRIGGER IF EXISTS enforce_media_documents_plan_limit ON public.media_documents;
CREATE TRIGGER enforce_media_documents_plan_limit BEFORE INSERT ON public.media_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_media_documents');

DROP TRIGGER IF EXISTS enforce_voice_profiles_plan_limit ON public.voice_profiles;
CREATE TRIGGER enforce_voice_profiles_plan_limit BEFORE INSERT ON public.voice_profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_voice_clones');

DROP TRIGGER IF EXISTS enforce_conversations_plan_limit ON public.conversations;
CREATE TRIGGER enforce_conversations_plan_limit BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_trigger('max_conversations');

CREATE OR REPLACE FUNCTION public.enforce_ai_usage_limit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
  v_is_super_admin boolean := false;
BEGIN
  IF NEW.sender_type <> 'agent' THEN RETURN NEW; END IF;

  SELECT COALESCE(p.is_super_admin, false) INTO v_is_super_admin
  FROM public.profiles p WHERE p.id = auth.uid();

  IF v_is_super_admin THEN RETURN NEW; END IF;

  PERFORM 1 FROM public.businesses WHERE id = NEW.business_id FOR UPDATE;
  v_check := public.check_plan_limit(NEW.business_id, 'max_ai_usage_per_month');

  IF COALESCE((v_check->>'error') <> '', false) THEN
    RAISE EXCEPTION 'PLAN_LIMIT_ERROR: %', v_check->>'error' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE((v_check->>'allowed')::boolean, false) = false THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: AI monthly usage is % of the allowed %.', COALESCE(v_check->>'current','0'), COALESCE(v_check->>'max','0') USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_usage_limit_trigger() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_ai_usage_plan_limit ON public.messages;
CREATE TRIGGER enforce_ai_usage_plan_limit BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_usage_limit_trigger();