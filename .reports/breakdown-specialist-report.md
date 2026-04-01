status: pass
summary: Broke feature e63ee03a into 2 parallel jobs to fix staging env var bleedthrough into production agents
jobs_created: 2
dependency_depth: 1

## Jobs

### Job 1 — Sanitize staging env vars in desktop CLI spawner (simple)
ID: 20d6ebec-9541-4559-be47-5e2a7f2c1413
File: packages/desktop/src/main/cli.ts
Fix: Add explicit `env` option to the zazig CLI spawn call, overriding ZAZIG_ENV=production and ZAZIG_HOME=~/.zazigv2 so staging vars from the parent terminal cannot bleed into the subprocess.
depends_on: []

### Job 2 — Explicitly set ZAZIG_ENV and ZAZIG_HOME in agent env construction (medium)
ID: 80ef4635-8d72-498c-a609-e0baedf61763
File: packages/cli/src/commands/start.ts
Fix: Add ZAZIG_ENV: zazigEnv to the agent env object; replace the conditional ZAZIG_HOME inherit with an explicit computation based on zazigEnv. Add regression test verifying staging vars in process.env don't leak into a production agent's env.
depends_on: []

## Dependency Graph

20d6ebec ──┐
           │  (parallel, no cross-dependency)
80ef4635 ──┘

## Analysis

The bug (this worktree itself demonstrates it — ZAZIG_ENV=staging and ZAZIG_HOME=~/.zazigv2-staging are in the process environment):

1. Desktop spawns CLI with no explicit env → stages vars inherited
2. CLI reads ZAZIG_ENV=staging → treats itself as staging (wrong runtime, wrong home dir)
3. Agent env built with ...process.env → ZAZIG_ENV and ZAZIG_HOME both wrong

Two independent defensive layers, either sufficient alone but belt-and-suspenders together.
