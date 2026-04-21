status: pass
summary: Added completion watch loop (watchCompletedIdeaStageJobs) in orchestrator that advances idea status when task-execute jobs complete (→ 'done') and initiative-breakdown jobs complete (→ 'spawned'), with on_hold=false guards on dispatch queries and idempotent atomic transitions via optimistic locking. Also added enriched-idea routing hardening by normalizing idea type matching and enforcing one-active-job-per-idea before Bug/Feature promote-idea dispatch.
files_changed:
  - supabase/functions/orchestrator/index.ts
  - .reports/senior-engineer-report.md
failure_reason: ""
