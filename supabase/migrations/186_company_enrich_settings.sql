ALTER TABLE companies
ADD COLUMN IF NOT EXISTS enrich_delay_minutes INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS enrich_max_concurrent INTEGER DEFAULT 2;

COMMENT ON COLUMN companies.enrich_delay_minutes IS
'How many minutes after triaged_at before the orchestrator auto-enriches an incomplete idea';

COMMENT ON COLUMN companies.enrich_max_concurrent IS
'Max concurrent auto-enrichment headless sessions per company';
