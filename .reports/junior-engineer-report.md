status: pass
summary: Added status whitelist (requested, claimed, starting, run) and 2-day recency filter to expert_sessions query in status.ts. Updated orchestrator to use 'run' status instead of 'running'/'completed', removed stale 'executing' from ACTIVE_SPEC_SESSION_STATUSES, and fixed conditional guards to use the new status model without inverting business logic.
files_changed:
  - packages/cli/src/commands/status.ts
  - supabase/functions/orchestrator/index.ts
failure_reason:
