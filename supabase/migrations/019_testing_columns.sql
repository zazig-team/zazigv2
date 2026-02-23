-- Migration: add testing-phase columns to features table
-- Date: 2026-02-23
-- Purpose: Store test deployment metadata so the orchestrator can manage
-- the Slack testing loop (post test URL, track approval thread, teardown).

ALTER TABLE public.features
    ADD COLUMN IF NOT EXISTS test_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS test_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS slack_channel VARCHAR(100),
    ADD COLUMN IF NOT EXISTS slack_thread_ts VARCHAR(50);

COMMENT ON COLUMN public.features.test_url IS 'Preview/test URL for the deployed feature branch (set by deploy_complete handler)';
COMMENT ON COLUMN public.features.test_started_at IS 'When the feature entered the testing phase and deploy completed';
COMMENT ON COLUMN public.features.slack_channel IS 'Slack channel ID where the testing thread lives';
COMMENT ON COLUMN public.features.slack_thread_ts IS 'Slack thread timestamp for the testing conversation';
