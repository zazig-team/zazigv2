-- 067_standalone_dispatch_fast_track.sql
-- Deliverable 1: standalone dispatch + fast-track pipeline mode.

BEGIN;

-- 1) Track whether jobs come from the feature pipeline or standalone dispatch.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pipeline';

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_source_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_source_check
  CHECK (source IN ('pipeline', 'standalone'));

-- 2) Pipeline jobs must keep feature_id; standalone jobs may omit it.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_feature_id_required;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_feature_id_required
  CHECK (source = 'standalone' OR feature_id IS NOT NULL);

-- 3) Fast-track flag for features that can skip breakdown + combine.
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS fast_track boolean NOT NULL DEFAULT false;

-- 4) Atomic standalone-dispatch entrypoint.
CREATE OR REPLACE FUNCTION public.request_standalone_work(
  p_company_id uuid,
  p_project_id uuid,
  p_feature_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_context text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_feature_status text;
  v_feature_title text;
  v_existing_job_id uuid;
  v_job_id uuid;
  v_title text;
  v_job_type text;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('rejected', true, 'reason', 'company_id is required');
  END IF;

  IF p_project_id IS NULL THEN
    RETURN jsonb_build_object('rejected', true, 'reason', 'project_id is required');
  END IF;

  IF p_role IS NULL OR p_role NOT IN (
    'pipeline-technician',
    'monitoring-agent',
    'verification-specialist',
    'project-architect'
  ) THEN
    RETURN jsonb_build_object(
      'rejected',
      true,
      'reason',
      'role must be one of: pipeline-technician, monitoring-agent, verification-specialist, project-architect'
    );
  END IF;

  IF p_context IS NULL OR btrim(p_context) = '' THEN
    RETURN jsonb_build_object('rejected', true, 'reason', 'context is required');
  END IF;

  IF p_role = 'verification-specialist' AND p_feature_id IS NULL THEN
    RETURN jsonb_build_object('rejected', true, 'reason', 'feature_id is required for verification-specialist');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = p_project_id
      AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('rejected', true, 'reason', 'Project not found for company');
  END IF;

  -- Lock the feature row when supplied to close TOCTOU windows.
  IF p_feature_id IS NOT NULL THEN
    SELECT status, title
    INTO v_feature_status, v_feature_title
    FROM public.features
    WHERE id = p_feature_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('rejected', true, 'reason', 'Feature not found for company');
    END IF;

    -- pipeline-technician and verification-specialist are allowed to target active features.
    IF p_role NOT IN ('pipeline-technician', 'verification-specialist')
       AND v_feature_status NOT IN ('created', 'design', 'speccing', 'complete', 'cancelled', 'failed') THEN
      RETURN jsonb_build_object(
        'rejected',
        true,
        'reason',
        format(
          'Feature "%s" is in ''%s'' state. Use the pipeline for work on active features.',
          COALESCE(v_feature_title, p_feature_id::text),
          v_feature_status
        )
      );
    END IF;
  END IF;

  -- Idempotency: no active duplicate role+feature (or role+project when feature is null).
  SELECT id
  INTO v_existing_job_id
  FROM public.jobs
  WHERE company_id = p_company_id
    AND project_id = p_project_id
    AND role = p_role
    AND feature_id IS NOT DISTINCT FROM p_feature_id
    AND status IN ('queued', 'dispatched', 'executing')
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'rejected',
      true,
      'reason',
      format('Active job already exists for role ''%s'' (job_id=%s)', p_role, v_existing_job_id)
    );
  END IF;

  v_title := CASE p_role
    WHEN 'pipeline-technician' THEN 'Execute prescribed pipeline operations'
    WHEN 'monitoring-agent' THEN 'Investigate monitoring anomaly'
    WHEN 'verification-specialist' THEN 'Run targeted verification'
    WHEN 'project-architect' THEN 'Structure project plan'
    ELSE 'Standalone operational task'
  END;

  v_job_type := CASE p_role
    WHEN 'pipeline-technician' THEN 'infra'
    WHEN 'monitoring-agent' THEN 'research'
    WHEN 'verification-specialist' THEN 'verify'
    WHEN 'project-architect' THEN 'design'
    ELSE 'research'
  END;

  INSERT INTO public.jobs (
    company_id,
    project_id,
    feature_id,
    role,
    job_type,
    complexity,
    status,
    title,
    context,
    depends_on,
    source
  )
  VALUES (
    p_company_id,
    p_project_id,
    p_feature_id,
    p_role,
    v_job_type,
    'medium',
    'queued',
    v_title,
    p_context,
    '{}'::uuid[],
    'standalone'
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'role', p_role,
    'status', 'queued',
    'message', 'Job created and queued for dispatch.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_standalone_work(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_standalone_work(uuid, uuid, uuid, text, text) TO service_role;

-- 5) Pipeline completeness checks should ignore standalone jobs.
CREATE OR REPLACE FUNCTION public.all_feature_jobs_complete(p_feature_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.jobs
    WHERE feature_id = p_feature_id
      AND status NOT IN ('complete', 'failed', 'cancelled')
      AND (source IS NULL OR source = 'pipeline')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

COMMIT;
