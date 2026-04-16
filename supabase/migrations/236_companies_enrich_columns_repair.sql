-- 236_companies_enrich_columns_repair.sql
-- Repair: add the two companies.enrich_* columns that orchestrator's
-- autoEnrichIncompleteTriagedIdeas reads (see supabase/functions/orchestrator
-- /index.ts:4097). Migration 160_company_enrich_settings.sql was orphaned by
-- a migration-number conflict (number 160 was also taken by
-- expert_sessions_claimed_status, which applied first and claimed the slot
-- in schema_migrations). As a result the enrich columns never reached prod
-- and every orchestrator tick logs:
--   "auto-enrich: failed to load companies: column companies.enrich_delay_minutes does not exist"
--
-- Defaults match the fallbacks in the orchestrator code (10 min / 2 concurrent).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS enrich_delay_minutes  INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS enrich_max_concurrent INTEGER DEFAULT 2;

COMMENT ON COLUMN public.companies.enrich_delay_minutes IS
  'Minutes after ideas.triaged_at before autoEnrichIncompleteTriagedIdeas will dispatch an enrichment session.';
COMMENT ON COLUMN public.companies.enrich_max_concurrent IS
  'Max concurrent headless enrichment sessions per company.';
