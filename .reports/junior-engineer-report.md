status: pass
summary: Extended `zazig start` preflight to collect and print a separate optional-warning block for staging `bun` and macOS `codesign` checks without blocking startup, while preserving existing codex soft-check flow.
files_changed:
  - packages/cli/src/commands/start.ts
  - .reports/junior-engineer-report.md
failure_reason: 
