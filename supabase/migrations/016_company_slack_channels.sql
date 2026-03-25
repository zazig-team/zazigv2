-- Migration: add slack_channels to companies table
--
-- Slack channel IDs are company-level config — any machine hosting the CPO
-- for a given company should listen to the same channels.
-- Moving them out of machine.yaml (machine-level) and into the companies table
-- enables automatic failover: whichever machine picks up the CPO job gets the
-- correct channels from Supabase at spawn time.

ALTER TABLE public.companies
  ADD COLUMN slack_channels jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.companies.slack_channels IS
  'Slack channel IDs the CPO listens to for @mentions. DMs are always accepted.';
