status: pass
summary: Updated local-agent expert session lifecycle to write `run` at launch and never write any post-run completion status to the database.
files_changed:
  - packages/local-agent/src/expert-session-manager.ts
  - packages/local-agent/src/expert-session-manager.test.ts
failure_reason:
