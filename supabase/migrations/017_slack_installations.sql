-- Migration: slack_installations table for multi-tenant Slack bot tokens
-- Date: 2026-02-22
-- Purpose: Store per-workspace Slack bot tokens. Edge Functions read these to post messages.

CREATE TABLE public.slack_installations (
  team_id         TEXT PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  team_name       TEXT,
  bot_token       TEXT NOT NULL,
  bot_user_id     TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  scope           TEXT,
  authed_user_id  TEXT,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.slack_installations IS 'Per-workspace Slack bot tokens. Each row represents one Slack workspace that installed the zazig app. Edge Functions read bot_token to post messages. team_id is the Slack workspace ID (e.g. T01234ABC).';

CREATE TRIGGER slack_installations_updated_at
    BEFORE UPDATE ON public.slack_installations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_slack_installations_company_id ON public.slack_installations(company_id);

ALTER TABLE public.slack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.slack_installations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
