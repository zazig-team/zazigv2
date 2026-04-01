-- 230_completed_features_recent_order.sql
-- Date: 2026-04-01
-- Purpose: Fix completed_features ordering in pipeline snapshot to use completed_at
--          instead of updated_at so recently completed features appear first.
--          updated_at can be touched by unrelated updates, causing old features to
--          appear at the top while newly completed ones fall below the LIMIT.

CREATE OR REPLACE FUNCTION public.refresh_pipeline_snapshot(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', now(),
    'features_by_status', COALESCE((
      SELECT jsonb_object_agg(status, features_list)
      FROM (
        SELECT f.status, jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'title', f.title,
            'priority', f.priority,
            'created_at', f.created_at,
            'updated_at', f.updated_at,
            'has_failed_jobs', COALESCE(feature_jobs.failed_jobs, 0) > 0,
            'has_job_errors', COALESCE(feature_jobs.jobs_with_errors, 0) > 0,
            'critical_job_error_count', COALESCE(feature_jobs.jobs_with_critical_errors, 0),
            'jobs_total', COALESCE(feature_jobs.jobs_total, 0),
            'jobs_done', COALESCE(feature_jobs.jobs_done, 0)
          ) ORDER BY f.updated_at DESC
        ) AS features_list
        FROM public.features f
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE j.status = 'failed') AS failed_jobs,
            COUNT(*) FILTER (
              WHERE j.error_analysis IS NOT NULL
                AND jsonb_array_length(j.error_analysis->'errors') > 0
            ) AS jobs_with_errors,
            COUNT(*) FILTER (
              WHERE j.error_analysis IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(j.error_analysis->'errors') e
                  WHERE e->>'severity' = 'critical'
                )
            ) AS jobs_with_critical_errors,
            COUNT(*) FILTER (WHERE j.status IS DISTINCT FROM 'cancelled') AS jobs_total,
            COUNT(*) FILTER (WHERE j.status = 'complete') AS jobs_done
          FROM public.jobs j
          WHERE j.feature_id = f.id
            AND j.company_id = p_company_id
        ) feature_jobs ON TRUE
        WHERE f.company_id = p_company_id
          AND f.status NOT IN ('complete', 'cancelled')
        GROUP BY f.status
      ) grouped
    ), '{}'::jsonb),
    'completed_features', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'title', f.title,
          'status', f.status,
          'updated_at', f.updated_at,
          'completed_at', f.completed_at,
          'promoted_version', f.promoted_version
        ) ORDER BY f.completed_at DESC NULLS LAST
      )
      FROM (
        SELECT id, title, status, updated_at, completed_at, promoted_version
        FROM public.features
        WHERE company_id = p_company_id
          AND status = 'complete'
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 10
      ) f
    ), '[]'::jsonb),
    'active_jobs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', j.id,
          'feature_id', j.feature_id,
          'role', j.role,
          'job_type', j.job_type,
          'status', j.status,
          'machine_id', j.machine_id,
          'created_at', j.created_at
        ) ORDER BY j.created_at DESC
      )
      FROM public.jobs j
      WHERE j.company_id = p_company_id
        AND j.status IN ('queued', 'dispatched', 'executing')
      LIMIT 50
    ), '[]'::jsonb),
    'failed_jobs_recent', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', j.id,
          'feature_id', j.feature_id,
          'role', j.role,
          'job_type', j.job_type,
          'result', j.result,
          'created_at', j.created_at
        ) ORDER BY j.created_at DESC
      )
      FROM public.jobs j
      WHERE j.company_id = p_company_id
        AND j.status = 'failed'
        AND j.created_at > now() - INTERVAL '24 hours'
      LIMIT 20
    ), '[]'::jsonb),
    'ideas_inbox', jsonb_build_object(
      'new_count', (
        SELECT count(*)
        FROM public.ideas i
        WHERE i.company_id = p_company_id
          AND i.status = 'new'
      ),
      'total_count', (
        SELECT count(*)
        FROM public.ideas i
        WHERE i.company_id = p_company_id
      )
    ),
    'capacity', COALESCE((
      SELECT jsonb_build_object(
        'machines_online', count(*) FILTER (WHERE m.status = 'online'),
        'total_claude_code_slots', COALESCE(sum(m.slots_claude_code) FILTER (WHERE m.status = 'online'), 0),
        'total_codex_slots', COALESCE(sum(m.slots_codex) FILTER (WHERE m.status = 'online'), 0)
      )
      FROM public.machines m
      WHERE m.company_id = p_company_id
    ), '{"machines_online":0,"total_claude_code_slots":0,"total_codex_slots":0}'::jsonb)
  ) INTO v_snapshot;

  INSERT INTO public.pipeline_snapshots (company_id, snapshot, updated_at)
  VALUES (p_company_id, v_snapshot, now())
  ON CONFLICT (company_id)
  DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = EXCLUDED.updated_at;
END;
$$;
