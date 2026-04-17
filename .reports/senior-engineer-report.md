status: pass
summary: Added an inline post-spawn health check in `handlePersistentJob()` that waits 2s, validates tmux liveness and `pane_dead_status`, captures early log output on failure, and fails fast through the existing job-failure path. Also added a persistent-heartbeat tmux liveness check that logs dead sessions and skips the tick, and upgraded capturePane catch logging to structured error-level output.
files_changed:
  - packages/local-agent/src/executor.ts
  - .reports/senior-engineer-report.md
failure_reason:
