-- 059: Pipeline remediation (Phase 1 + locking primitives)
-- Date: 2026-02-26
-- Adds:
--   1) features.test_deploy_attempts counter for bounded retry behavior
--   2) atomic machine slot release RPC (no read-modify-write race)
--   3) serialized per-project test-env claim RPC using advisory locks

ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS test_deploy_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.features
  DROP CONSTRAINT IF EXISTS features_test_deploy_attempts_non_negative;

ALTER TABLE public.features
  ADD CONSTRAINT features_test_deploy_attempts_non_negative
  CHECK (test_deploy_attempts >= 0);

COMMENT ON COLUMN public.features.test_deploy_attempts IS
  'Number of times this feature has entered deploying_to_test. Used for retry cap enforcement.';

CREATE OR REPLACE FUNCTION public.release_machine_slot(
  p_machine_id uuid,
  p_slot_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_slot_type = 'codex' THEN
    UPDATE public.machines
      SET slots_codex = slots_codex + 1
      WHERE id = p_machine_id;
  ELSE
    UPDATE public.machines
      SET slots_claude_code = slots_claude_code + 1
      WHERE id = p_machine_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_machine_slot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_machine_slot(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_test_deploy_slot(
  p_feature_id uuid,
  p_max_attempts integer DEFAULT 3
)
RETURNS TABLE (
  claimed boolean,
  reason text,
  company_id uuid,
  project_id uuid,
  feature_branch text,
  test_deploy_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_feature public.features%ROWTYPE;
  v_lock_key bigint;
  v_env_busy boolean;
  v_attempts integer;
BEGIN
  SELECT *
  INTO v_feature
  FROM public.features
  WHERE id = p_feature_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'feature_not_found',
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      0;
    RETURN;
  END IF;

  v_lock_key := hashtextextended(COALESCE(v_feature.project_id::text, v_feature.id::text), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_feature.status <> 'verifying' THEN
    RETURN QUERY SELECT
      false,
      'not_verifying',
      v_feature.company_id,
      v_feature.project_id,
      v_feature.branch,
      COALESCE(v_feature.test_deploy_attempts, 0);
    RETURN;
  END IF;

  IF v_feature.branch IS NULL OR v_feature.branch = '' THEN
    RETURN QUERY SELECT
      false,
      'missing_branch',
      v_feature.company_id,
      v_feature.project_id,
      v_feature.branch,
      COALESCE(v_feature.test_deploy_attempts, 0);
    RETURN;
  END IF;

  IF COALESCE(v_feature.test_deploy_attempts, 0) >= p_max_attempts THEN
    RETURN QUERY SELECT
      false,
      'retry_cap_exceeded',
      v_feature.company_id,
      v_feature.project_id,
      v_feature.branch,
      COALESCE(v_feature.test_deploy_attempts, 0);
    RETURN;
  END IF;

  IF v_feature.project_id IS NULL THEN
    v_env_busy := false;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.features f2
      WHERE f2.id <> v_feature.id
        AND f2.project_id = v_feature.project_id
        AND f2.status IN ('deploying_to_test', 'ready_to_test')
    ) INTO v_env_busy;
  END IF;

  IF v_env_busy THEN
    RETURN QUERY SELECT
      false,
      'env_busy',
      v_feature.company_id,
      v_feature.project_id,
      v_feature.branch,
      COALESCE(v_feature.test_deploy_attempts, 0);
    RETURN;
  END IF;

  UPDATE public.features
    SET status = 'deploying_to_test',
        test_deploy_attempts = COALESCE(test_deploy_attempts, 0) + 1,
        updated_at = now()
    WHERE id = v_feature.id
      AND status = 'verifying'
    RETURNING test_deploy_attempts INTO v_attempts;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'cas_miss',
      v_feature.company_id,
      v_feature.project_id,
      v_feature.branch,
      COALESCE(v_feature.test_deploy_attempts, 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    'claimed',
    v_feature.company_id,
    v_feature.project_id,
    v_feature.branch,
    v_attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_test_deploy_slot(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_test_deploy_slot(uuid, integer) TO service_role;
