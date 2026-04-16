-- 235_cross_tenant_job_failure_to_idea.sql
-- Cross-tenant job failure → bug idea in zazig-dev inbox.
--
-- Every job that transitions into status='failed' (across any tenant) fires
-- an AFTER UPDATE trigger that inserts one idea into the zazig-dev inbox.
-- The idea lands at status='new' with item_type='bug' for normal triage.
--
-- Idempotency: ON CONFLICT DO NOTHING backed by a partial unique index on
-- (source_ref) WHERE source='monitoring' AND originator='job-failure-monitor'.
--
-- Safety: the INSERT is wrapped in BEGIN...EXCEPTION WHEN OTHERS so a trigger
-- failure never blocks the jobs.status update. Failures emit a WARNING.

CREATE OR REPLACE FUNCTION notify_job_failure_to_zazig()
RETURNS TRIGGER AS $$
DECLARE
  v_feature_title TEXT;
  v_commit_sha    TEXT;
  v_company_name  TEXT;
  v_raw_text      TEXT;
BEGIN
  -- Only fire on transition INTO 'failed' (not within 'failed').
  IF NEW.status <> 'failed' OR OLD.status IS NOT DISTINCT FROM 'failed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Gather context via joins (all within the same Supabase instance).
    SELECT f.title, f.commit_sha, c.name
      INTO v_feature_title, v_commit_sha, v_company_name
      FROM features f
      LEFT JOIN companies c ON c.id = NEW.company_id
      WHERE f.id = NEW.feature_id;

    v_raw_text := format(
      'Job %s failed after retries.\nCompany: %s (%s)\nRole: %s  Model: %s\nResult: %s\nFeature: %s (%s)\nCommit: %s\n\nerror_analysis:\n%s',
      NEW.id,
      COALESCE(v_company_name, '<unknown>'),
      NEW.company_id,
      COALESCE(NEW.role, '<unknown>'),
      COALESCE(NEW.model, '<unknown>'),
      COALESCE(NEW.result, '<none>'),
      COALESCE(v_feature_title, '<unknown>'),
      NEW.feature_id,
      COALESCE(v_commit_sha, '<none>'),
      COALESCE(LEFT(NEW.error_analysis::text, 2000), '<no error_analysis>')
    );

    INSERT INTO public.ideas (
      company_id,
      project_id,
      item_type,
      source,
      originator,
      source_ref,
      raw_text,
      status,
      priority
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
      'bug',
      'monitoring',
      'job-failure-monitor',
      NEW.id::text,
      v_raw_text,
      'new',
      'medium'
    )
    ON CONFLICT DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Never block the job status update.
    RAISE WARNING 'notify_job_failure_to_zazig failed for job %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_failure_to_zazig
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_job_failure_to_zazig();

-- Partial unique index backing ON CONFLICT DO NOTHING for job-failure-monitor rows.
CREATE UNIQUE INDEX IF NOT EXISTS ideas_job_failure_source_ref_uniq
  ON public.ideas (source_ref)
  WHERE source = 'monitoring' AND originator = 'job-failure-monitor';
