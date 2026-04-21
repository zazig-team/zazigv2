status: pass
summary: Added an idempotent Supabase migration that inserts the zazig-dev `company` project for https://github.com/zazig-team/company and sets `companies.company_project_id` to that project UUID.
files_changed:
  - supabase/migrations/251_seed_zazig_dev_company_project.sql
  - .reports/junior-engineer-report.md
failure_reason:
