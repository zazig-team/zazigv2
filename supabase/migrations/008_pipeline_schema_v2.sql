-- zazigv2 pipeline schema v2 migration
-- Date: 2026-02-20
-- Purpose: Add pipeline-specific columns, expand workflow status/event enums, and
-- create helper functions for job slot release and feature completion checks.

-- NOTE: This migration adds new pipeline status values while preserving existing
-- legacy values ('in_progress'/'complete' on features, 'complete' on jobs) for
-- backward compatibility. New pipeline code must handle both old and new values:
--   features: 'in_progress' = 'building', 'complete' = 'done' (semantically equivalent)
--   jobs:     'complete' = 'done' (semantically equivalent, legacy value preserved)
-- A future migration will consolidate these once all consumers are updated.

-- ============================================================
-- features: pipeline metadata columns + expanded status lifecycle
-- ============================================================

ALTER TABLE public.features
    ADD COLUMN spec text,
    ADD COLUMN acceptance_tests text,
    ADD COLUMN human_checklist text,
    ADD COLUMN feature_branch text;

ALTER TABLE public.features
    DROP CONSTRAINT IF EXISTS features_status_check;

ALTER TABLE public.features
    ADD CONSTRAINT features_status_check
    CHECK (status IN (
        'proposed', 'designing', 'in_progress', 'complete',
        'design', 'building', 'verifying', 'testing', 'done', 'cancelled'
    ));

-- ============================================================
-- jobs: pipeline metadata columns + expanded status lifecycle
-- ============================================================

ALTER TABLE public.jobs
    ADD COLUMN acceptance_tests text,
    ADD COLUMN sequence integer,
    ADD COLUMN job_branch text,
    ADD COLUMN verify_context text,
    ADD COLUMN rejection_feedback text;

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
        'queued', 'dispatched', 'executing', 'waiting_on_human', 'reviewing',
        'complete', 'failed', 'verifying', 'verify_failed', 'testing',
        'approved', 'rejected', 'done', 'cancelled'
    ));

-- ============================================================
-- events: expand allowed event types for pipeline v2 lifecycle
-- ============================================================

ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
    ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN (
        'job_created', 'job_dispatched', 'job_executing', 'job_complete',
        'job_failed', 'job_waiting_on_human', 'job_reviewing',
        'machine_online', 'machine_offline', 'machine_heartbeat',
        'agent_started', 'agent_stopped', 'agent_memory_flush',
        'feature_created', 'feature_status_changed',
        'company_created', 'company_suspended', 'company_archived',
        'human_reply', 'escalation',
        'job_verifying', 'job_verify_failed', 'job_testing', 'job_approved',
        'job_rejected', 'job_done', 'job_cancelled',
        'feature_building', 'feature_verifying', 'feature_testing',
        'feature_done', 'feature_cancelled'
    ));

-- ============================================================
-- helper procedures
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_slot(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_machine_id uuid;
  v_slot_type text;
BEGIN
  SELECT machine_id, slot_type INTO v_machine_id, v_slot_type
  FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_slot_type = 'codex' THEN
    UPDATE public.machines SET slots_codex = slots_codex + 1 WHERE id = v_machine_id;
  ELSE
    UPDATE public.machines SET slots_claude_code = slots_claude_code + 1 WHERE id = v_machine_id;
  END IF;

  UPDATE public.jobs SET status = 'done', completed_at = now() WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.all_feature_jobs_complete(p_feature_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE feature_id = p_feature_id
      AND status != 'cancelled'
      AND status NOT IN ('done', 'approved', 'complete')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- ============================================================
-- restrict SECURITY DEFINER functions to service_role only
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.release_slot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.all_feature_jobs_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_slot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.all_feature_jobs_complete(uuid) TO service_role;
