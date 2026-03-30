status: fail
summary: Implemented `zazig ui` to resolve company context, ensure daemon startup, and launch the TUI via `@zazig/tui`, with command registration and workspace dependency wiring.
files_changed:
  - packages/cli/src/commands/ui.ts
  - packages/cli/src/index.ts
  - packages/cli/package.json
  - packages/tui/src/index.tsx
  - packages/tui/package.json
  - packages/tui/tsconfig.json
  - package-lock.json
failure_reason: Could not create git index lock in the worktree metadata path (`.git/worktrees/.../index.lock`) due sandbox permission denial, so commit could not be completed.
