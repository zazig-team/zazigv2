status: pass
summary: Reworked desktop main-process expert auto-switching so poller emits `EXPERT_SESSION_AUTO_SWITCH` IPC instead of attaching PTY directly, and company selection now resets expert session tracking to prevent stale auto-switches.
files_changed:
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/main/index.ts
  - .reports/senior-engineer-report.md
failure_reason: ""
