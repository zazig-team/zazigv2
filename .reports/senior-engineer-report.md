status: pass
summary: Removed dead verify dispatch/result handlers, added migration 241 to drop `verify` from `jobs_job_type_check`, and deprecated local-agent `verify_job` handling to a logged no-op while preserving shared wire-protocol compatibility.
files_changed:
  - supabase/migrations/241_remove_verify_job_type.sql
  - supabase/functions/orchestrator/index.ts
  - supabase/functions/agent-event/handlers.ts
  - supabase/functions/agent-event/index.ts
  - packages/local-agent/src/index.ts
  - supabase/functions/_shared/pipeline-utils.ts

---

## Previous report (retry-failed-uploads feature e2df6871)

summary: Added retry logic to resolveContext in executor.ts to handle transient 5xx and network errors when fetching contextRef presigned URLs, with 3 max retries, exponential back-off, and no retry for 4xx permanent errors.
files_changed:
  - packages/local-agent/src/executor.ts
