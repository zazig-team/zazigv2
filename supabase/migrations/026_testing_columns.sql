-- Migration: add testing-phase columns to features table
-- Date: 2026-02-23
-- Purpose: Store test deployment metadata so the orchestrator can manage
-- the Slack testing loop (post test URL, track approval thread, teardown).

ALTER TABLE public.features
    ADD COLUMN IF NOT EXISTS test_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS test_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS slack_channel VARCHAR(100),
    ADD COLUMN IF NOT EXISTS slack_thread_ts VARCHAR(50),
    ADD COLUMN IF NOT EXISTS testing_machine_id TEXT;

COMMENT ON COLUMN public.features.test_url IS 'Preview/test URL for the deployed feature branch (set by deploy_complete handler)';
COMMENT ON COLUMN public.features.test_started_at IS 'When the feature entered the testing phase and deploy completed';
COMMENT ON COLUMN public.features.slack_channel IS 'Slack channel ID where the testing thread lives';
COMMENT ON COLUMN public.features.slack_thread_ts IS 'Slack thread timestamp for the testing conversation';
COMMENT ON COLUMN public.features.testing_machine_id IS 'Machine ID that deployed the test environment (set by deploy_complete handler, used for teardown routing)';

-- Index for Slack testing thread lookup — queried on every incoming Slack message
CREATE INDEX IF NOT EXISTS features_slack_thread_idx
    ON public.features(slack_channel, slack_thread_ts)
    WHERE slack_channel IS NOT NULL AND slack_thread_ts IS NOT NULL;
