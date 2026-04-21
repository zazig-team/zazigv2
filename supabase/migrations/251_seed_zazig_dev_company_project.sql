-- 251_seed_zazig_dev_company_project.sql
-- Seed zazig-dev default company project and link companies.company_project_id.
-- Company repo URL: https://github.com/zazig-team/company
-- Expected repo structure: sales/, marketing/, research/, docs/

WITH upserted_project AS (
  INSERT INTO public.projects (
    company_id,
    name,
    repo_url,
    status
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'company',
    'https://github.com/zazig-team/company',
    'active'
  )
  ON CONFLICT (company_id, name)
  DO UPDATE SET
    repo_url = EXCLUDED.repo_url,
    status = EXCLUDED.status
  RETURNING id
), resolved_project AS (
  SELECT id FROM upserted_project
  UNION ALL
  SELECT p.id
  FROM public.projects p
  WHERE p.company_id = '00000000-0000-0000-0000-000000000001'
    AND p.name = 'company'
  LIMIT 1
)
UPDATE public.companies c
SET company_project_id = (SELECT id FROM resolved_project LIMIT 1)
WHERE c.id = '00000000-0000-0000-0000-000000000001';
