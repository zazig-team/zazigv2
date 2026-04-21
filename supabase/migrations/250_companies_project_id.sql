-- 250_companies_project_id.sql
-- Add optional default project pointer for a company.

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_company_project_id_fkey'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_company_project_id_fkey
      FOREIGN KEY (company_project_id)
      REFERENCES public.projects (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
