status: pass
summary: Explicit daemon env construction now forwards the resolved ZAZIG_ENV and computes ZAZIG_HOME by environment, with a unit test proving production sessions override inherited staging vars.
files_changed:
  - packages/cli/src/commands/start.ts
  - packages/cli/src/commands/start-env.ts
  - packages/cli/src/commands/__tests__/start.test.ts
failure_reason:
