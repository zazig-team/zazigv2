-- 232_v3_sidebar_columns.sql
-- v3 iOS app needs short_name + color_seed to render Zazig avatars in the sidebar.
-- Both nullable; v3 falls back to client-side defaults if NULL.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS color_seed REAL;

-- Backfill. Idempotent: only touches rows still NULL.
UPDATE public.companies
SET short_name = UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z]', '', 'g'), 2))
WHERE short_name IS NULL
  AND name IS NOT NULL;

UPDATE public.companies
SET color_seed = (ABS(HASHTEXT(name)) % 100)::REAL / 100.0
WHERE color_seed IS NULL
  AND name IS NOT NULL;
