-- Migration 143: Company auto-spec settings.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_spec boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS spec_max_concurrent integer NOT NULL DEFAULT 2;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS spec_delay_minutes integer NOT NULL DEFAULT 5;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_spec_max_concurrent_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_spec_max_concurrent_check
  CHECK (spec_max_concurrent >= 1);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_spec_delay_minutes_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_spec_delay_minutes_check
  CHECK (spec_delay_minutes >= 0);
