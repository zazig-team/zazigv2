-- 227_agent_versions_promoted_version_trigger.sql
-- Stamp promoted_version on complete, unpromoted features when a production
-- agent version is registered.

CREATE OR REPLACE FUNCTION public.stamp_promoted_version_from_agent_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.env = 'production' THEN
    UPDATE features
    SET promoted_version = NEW.version
    WHERE status = 'complete'
      AND promoted_version IS NULL
      AND company_id = '00000000-0000-0000-0000-000000000001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_versions_stamp_promoted_version ON public.agent_versions;

CREATE TRIGGER trg_agent_versions_stamp_promoted_version
AFTER INSERT ON public.agent_versions
FOR EACH ROW
EXECUTE FUNCTION public.stamp_promoted_version_from_agent_version();
