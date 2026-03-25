-- 214_idea_closing_loop.sql
-- Close the idea–feature loop automatically.
--
-- When a feature reaches a terminal state, update its source idea:
--   merged     → idea status = 'done'   (work delivered)
--   cancelled  → idea status = 'stalled' (surfaces in inbox for review)
--   failed     → idea status = 'stalled' (surfaces in inbox for review)
--
-- Only updates ideas that are still 'promoted' — ideas manually moved
-- to other states are left alone.

CREATE OR REPLACE FUNCTION public.sync_idea_status_on_feature_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status actually changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Only act if this feature has a linked source idea
  IF NEW.source_idea_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'merged' THEN
    UPDATE public.ideas
    SET status = 'done', updated_at = now()
    WHERE id = NEW.source_idea_id
      AND status = 'promoted';

  ELSIF NEW.status IN ('cancelled', 'failed') THEN
    -- Surfaces back in the inbox (stalled = needs attention)
    UPDATE public.ideas
    SET status = 'stalled', updated_at = now()
    WHERE id = NEW.source_idea_id
      AND status = 'promoted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER feature_terminal_closes_idea
  AFTER UPDATE OF status ON public.features
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_idea_status_on_feature_terminal();
