status: pass
summary: Refactored awaiting-response resume flow to use a reusable single-idea resume helper, added a timed Supabase Realtime idea_messages subscription fast path, and integrated it with always-on polling fallback in the orchestrator cycle.
files_changed:
  - supabase/functions/orchestrator/index.ts
  - .reports/senior-engineer-report.md
failure_reason:
