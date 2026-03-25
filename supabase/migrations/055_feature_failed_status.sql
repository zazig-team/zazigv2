-- Add 'failed' status to features and an error column for failure details.
-- When a critical job (breakdown, combine, deploy) fails, the orchestrator
-- sets the feature to 'failed' with the error message.

-- 1. Add error column
ALTER TABLE public.features
    ADD COLUMN IF NOT EXISTS error text;

-- 2. Expand status constraint to include 'failed'
ALTER TABLE public.features
    DROP CONSTRAINT IF EXISTS features_status_check;

ALTER TABLE public.features
    ADD CONSTRAINT features_status_check
    CHECK (status IN (
        'created',
        'ready_for_breakdown',
        'breakdown',
        'building',
        'combining',
        'verifying',
        'deploying_to_test',
        'ready_to_test',
        'deploying_to_prod',
        'complete',
        'cancelled',
        'failed'
    ));
