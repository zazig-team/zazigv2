status: pass
summary: Implemented migration 251 to enable RLS on idea_messages with authenticated company-scoped SELECT and INSERT policies, relying on service_role bypass for job writes.
files_changed:
  - supabase/migrations/251_idea_messages_rls.sql
  - .reports/junior-engineer-report.md
failure_reason:
