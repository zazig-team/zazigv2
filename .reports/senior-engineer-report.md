status: pass
summary: Added completion watch loop (watchCompletedIdeaStageJobs) in orchestrator that advances idea status when task-execute jobs complete (→ 'done') and initiative-breakdown jobs complete (→ 'spawned'), with on_hold=false guards on dispatch queries and idempotent atomic transitions via optimistic locking.
files_changed:
  - supabase/functions/orchestrator/index.ts
