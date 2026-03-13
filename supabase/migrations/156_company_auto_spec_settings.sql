-- 155_company_auto_spec_settings.sql
-- Add auto-spec configuration columns to companies table.
-- auto_spec: enables automatic spec writing for develop-routed ideas.
-- spec_max_concurrent: max simultaneous spec-writer sessions.
-- spec_delay_minutes: minutes to wait after triage before starting spec.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_spec BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS spec_max_concurrent INTEGER DEFAULT 2;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS spec_delay_minutes INTEGER DEFAULT 5;
