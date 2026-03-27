-- Trigger: after inserting a production agent_version, stamp promoted_version
-- on all complete, unpromoted features for the zazig company.
-- The trigger runs as the table owner (bypasses RLS) so no policy changes needed.
-- The WHERE clause makes it idempotent: only unpromoted complete features are touched.

CREATE OR REPLACE FUNCTION stamp_promoted_version_on_features()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE TRIGGER agent_versions_stamp_promoted_version
AFTER INSERT ON agent_versions
FOR EACH ROW
EXECUTE FUNCTION stamp_promoted_version_on_features();
