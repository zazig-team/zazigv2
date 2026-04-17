status: pass
summary: Removed dead verify dispatch/result handlers, added migration 241 to drop `verify` from `jobs_job_type_check`, and deprecated local-agent `verify_job` handling to a logged no-op while preserving shared wire-protocol compatibility.
files_changed:
  - supabase/migrations/241_remove_verify_job_type.sql
  - supabase/functions/orchestrator/index.ts
  - supabase/functions/agent-event/handlers.ts
  - supabase/functions/agent-event/index.ts
  - packages/local-agent/src/index.ts
  - supabase/functions/_shared/pipeline-utils.ts
failure_reason:
