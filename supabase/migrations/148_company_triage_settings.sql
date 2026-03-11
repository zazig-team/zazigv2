-- 148_company_triage_settings.sql
-- Add triage configuration columns to companies (auto_triage already exists from migration 135).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_batch_size INTEGER DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_max_concurrent INTEGER DEFAULT 3;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_delay_minutes INTEGER DEFAULT 5;

COMMENT ON COLUMN companies.triage_batch_size IS 'Max ideas per headless triage session (default 5)';
COMMENT ON COLUMN companies.triage_max_concurrent IS 'Max concurrent headless triage sessions (default 3)';
COMMENT ON COLUMN companies.triage_delay_minutes IS 'Wait N minutes after idea creation before auto-triaging (default 5)';
