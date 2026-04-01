status: pass
summary: Fixed production desktop app CLI subprocess to explicitly set ZAZIG_ENV=production and ZAZIG_HOME to production path, and updated start.ts and executor.ts to resolve agent binary paths via ZAZIG_HOME instead of hardcoded ~/.zazigv2.
files_changed:
  - packages/desktop/src/main/cli.ts
  - packages/cli/src/commands/start.ts
  - packages/local-agent/src/executor.ts
