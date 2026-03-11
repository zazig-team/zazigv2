-- 149_remove_triage_from_pipeline.sql
-- Remove triage-analyst from request_standalone_work allowed roles.
-- Triage now runs via headless expert sessions, not pipeline jobs.

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
  v_feature_id uuid;
  v_branch text;
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

  -- When feature_id is supplied: lock and validate (existing behavior).
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

    v_feature_id := p_feature_id;

  ELSE
    -- No feature_id supplied: auto-create a feature at 'building' status.
    v_title := CASE p_role
      WHEN 'pipeline-technician' THEN 'Pipeline operations'
      WHEN 'monitoring-agent'    THEN 'Monitoring investigation'
      WHEN 'project-architect'   THEN 'Project scaffolding'
      ELSE 'Standalone task'
    END;

    v_branch := 'feature/standalone-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    INSERT INTO public.features (
      company_id,
      project_id,
      title,
      status,
      branch
    )
    VALUES (
      p_company_id,
      p_project_id,
      v_title,
      'building',
      v_branch
    )
    RETURNING id INTO v_feature_id;
  END IF;

  -- Idempotency: no active duplicate role+feature (or role+project when feature is null).
  SELECT id
  INTO v_existing_job_id
  FROM public.jobs
  WHERE company_id = p_company_id
    AND project_id = p_project_id
    AND role = p_role
    AND feature_id IS NOT DISTINCT FROM v_feature_id
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
    v_feature_id,
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
    'feature_id', v_feature_id,
    'role', p_role,
    'status', 'queued',
    'message', 'Job created and queued for dispatch.'
  );
END;
$$;
