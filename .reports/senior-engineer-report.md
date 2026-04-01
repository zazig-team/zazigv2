status: pass
summary: Added `expert_sessions` to `zazig status --json` by querying Supabase expert sessions for the current machine and returning normalized session metadata with a guaranteed empty-array default.
files_changed:
  - packages/cli/src/commands/status.ts
failure_reason:
