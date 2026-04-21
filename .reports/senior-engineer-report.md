status: pass
summary: Added reusable idea-pipeline dispatch safety helpers and wired new idea watch loops to enforce per-company concurrency caps, one-active-job-per-idea checks, and atomic status transitions.
files_changed:
  - supabase/functions/orchestrator/index.ts
failure_reason: ""
