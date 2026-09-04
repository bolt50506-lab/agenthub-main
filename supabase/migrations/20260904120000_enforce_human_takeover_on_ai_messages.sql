-- Central safety guard: once an operator takes over a conversation,
-- no automated AI message may be persisted for that conversation.
-- This protects every inbound channel even if a webhook route misses
-- the application-level human-takeover check.

CREATE OR REPLACE FUNCTION public.block_ai_messages_during_human_takeover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  takeover_enabled boolean;
BEGIN
  IF NEW.sender_type = 'agent' AND NEW.conversation_id IS NOT NULL THEN
    SELECT human_takeover
      INTO takeover_enabled
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF COALESCE(takeover_enabled, false) THEN
      RAISE EXCEPTION 'AI reply blocked: conversation is in human takeover mode'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_ai_messages_during_human_takeover ON public.messages;

CREATE TRIGGER trg_block_ai_messages_during_human_takeover
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.block_ai_messages_during_human_takeover();
