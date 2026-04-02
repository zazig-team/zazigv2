status: pass
summary: Added migration 231 to normalize expert_sessions statuses to run, enforce the new status CHECK constraint, and drop completed_at safely.
files_changed:
  - supabase/migrations/231_expert_sessions_run_status_model.sql
  - .reports/senior-engineer-report.md
failure_reason: ""

---

summary: Added behavior-focused regression coverage for persistent-agent sidebar rendering/semantics and queue-driven agent switching, including detach-before-attach sequencing and non-running no-op assertions.
files_changed:
  - packages/desktop/src/renderer/persistent-agents.ts
  - packages/desktop/src/renderer/App.tsx
  - tests/features/desktop-sidebar-persistent-agents-switching.test.ts
failure_reason:
