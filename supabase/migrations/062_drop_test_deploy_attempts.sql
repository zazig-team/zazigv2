-- Remove test_deploy_attempts column and claim_test_deploy_slot RPC.
-- Test deploys are now regular jobs — no special retry counting needed.

DROP FUNCTION IF EXISTS public.claim_test_deploy_slot(uuid, integer);

ALTER TABLE public.features
  DROP CONSTRAINT IF EXISTS features_test_deploy_attempts_non_negative;

ALTER TABLE public.features
  DROP COLUMN IF EXISTS test_deploy_attempts;
