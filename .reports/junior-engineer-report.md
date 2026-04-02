status: pass
summary: Updated orchestrator to use 'run' status instead of 'running'/'completed', removed stale 'executing' from ACTIVE_SPEC_SESSION_STATUSES, and fixed conditional guards to use the new status model without inverting business logic.
files_changed:
  - supabase/functions/orchestrator/index.ts
