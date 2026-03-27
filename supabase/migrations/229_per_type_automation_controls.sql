-- Per-type automation controls: replace boolean auto_triage/auto_spec
-- with array columns that specify which item_types are automated.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_triage_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_spec_types   text[] NOT NULL DEFAULT '{}';

-- Backfill from existing booleans
UPDATE companies
SET auto_triage_types = CASE
  WHEN auto_triage = true THEN '{idea,brief,bug,test}'::text[]
  ELSE '{}'::text[]
END,
auto_spec_types = CASE
  WHEN auto_spec = true THEN '{idea,brief,bug,test}'::text[]
  ELSE '{}'::text[]
END;
