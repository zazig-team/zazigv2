-- 107_pipeline_snapshots.sql
-- Date: 2026-03-04
-- Purpose: Create pipeline_snapshots table and refresh_pipeline_snapshot() function.
--          These were built manually on production but never captured as a migration.
--          See: docs/plans/shipped/2026-02-27-pipeline-snapshot-cache-proposal.md

-- ---------------------------------------------------------------------------
-- Table: one cached snapshot row per company
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_snapshots (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role only — agents read via the get-pipeline-snapshot edge function.
-- No RLS policies needed (service_role bypasses RLS).

-- ---------------------------------------------------------------------------
-- Function: refresh_pipeline_snapshot(p_company_id UUID)
--
-- Aggregates features, jobs, and ideas into a single JSONB snapshot and
-- upserts it into pipeline_snapshots. Called by the orchestrator heartbeat
-- and as a cold-start fallback from the get-pipeline-snapshot edge function.
-- ---------------------------------------------------------------------------
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
            'updated_at', f.updated_at
          ) ORDER BY f.updated_at DESC
        ) AS features_list
        FROM public.features f
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
          'updated_at', f.updated_at
        ) ORDER BY f.updated_at DESC
      )
      FROM public.features f
      WHERE f.company_id = p_company_id
        AND f.status = 'complete'
      LIMIT 10
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
