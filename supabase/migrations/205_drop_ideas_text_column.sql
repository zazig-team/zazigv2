-- Drop the legacy `text` column from the ideas table.
-- This column was the original MVP name (migration 102). It was superseded by
-- `raw_text` in migration 108, which backfilled the data. All application code
-- has used `raw_text` exclusively ever since. The `text NOT NULL` constraint
-- caused insert failures on any environment that still carries the column.
ALTER TABLE public.ideas DROP COLUMN IF EXISTS text;
