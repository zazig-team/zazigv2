# Standalone Binary Auto-Update

## Problem

The CLI and local-agent are distributed as `.mjs` bundles via `npm link`, which means:
- The `zazig` binary lives inside the repo checkout (symlinked through npm)
- Agents editing the repo can accidentally modify the `.mjs` files
- Other team members' local builds get out of sync with what `promote` produces
- There's no mechanism for remote machines to receive updates

## Solution

Replace npm-linked `.mjs` distribution with standalone native binaries compiled via Bun, distributed through GitHub Releases, and auto-updated on `zazig start`.

## Architecture

Three compiled binaries live in `~/.zazigv2/bin/`:

```
~/.zazigv2/bin/zazig              - CLI binary
~/.zazigv2/bin/zazig-agent        - daemon binary
~/.zazigv2/bin/agent-mcp-server   - MCP server binary
~/.zazigv2/bin/.version           - current version (semver, e.g. 0.13.0)
~/.zazigv2/bin/previous/          - rollback copies
```

User adds `~/.zazigv2/bin` to PATH. No npm link, no repo dependency at runtime.

## Promote Flow

After the existing bundle step, `promote` additionally:

1. **Compile binaries** — `bun build --compile` on each `.mjs` bundle to produce native macOS binaries
2. **Create GitHub Release** — tagged `v{version}` (e.g. `v0.13.0`) with the commit SHA
3. **Upload 3 assets** to the release:
   - `zazig-cli-darwin-arm64`
   - `zazig-agent-darwin-arm64`
   - `agent-mcp-server-darwin-arm64`
4. **Register version** — existing `agent_versions` insert (no schema change)

Asset naming includes platform suffix for future cross-platform support. Bun is only required on the machine running `promote`.

## Auto-Update Flow (`zazig start`)

Before spawning the daemon:

1. Authenticate (existing)
2. Query `agent_versions` for latest row matching current env (`production`)
3. Read local version from `~/.zazigv2/bin/.version`
4. **If up to date** — continue to spawn daemon normally
5. **If outdated:**
   - Copy current binaries to `~/.zazigv2/bin/previous/` (rollback)
   - Download all 3 binaries from the GitHub Release (hardcoded repo: `zazig-team/zazigv2`)
   - Replace binaries in `~/.zazigv2/bin/`
   - Write new version to `~/.zazigv2/bin/.version`
   - Print: `Updated zazig to v0.13.0. Please run 'zazig start' again.`
   - Exit 0

**Failure handling:** If download fails (network, GitHub down), warn but continue with current version. Never block the agent from starting.

**Daemon entry point:** `startDaemonForCompany` spawns `~/.zazigv2/bin/zazig-agent` directly instead of resolving through npm/pinned builds.

## Staging Mode

Staging (`zazig-staging`) continues to run from the repo via `tsx`/`node` as today. Auto-update only applies to production installs in `~/.zazigv2/bin/`.

## Migration (You and Tom)

1. Run `zazig promote` once — this creates the first GitHub Release with compiled binaries
2. Add `export PATH="$HOME/.zazigv2/bin:$PATH"` to `~/.zshrc`
3. Run `zazig start` from the old npm-linked version — it auto-updates and places binaries in `~/.zazigv2/bin/`
4. Remove the npm link: `npm unlink -g @zazig/cli`
5. Reload shell — `zazig` now resolves from `~/.zazigv2/bin/`

Tom gets future updates automatically on `zazig start`.

## Rollback

`zazig promote --rollback` swaps `~/.zazigv2/bin/` with `~/.zazigv2/bin/previous/` (same pattern as current `builds.ts` rollback).

## Files to Change

### Modify
- `packages/cli/src/commands/promote.ts` — add Bun compile step, GitHub Release creation + asset upload via `gh` CLI
- `packages/cli/src/commands/start.ts` — add auto-update check before daemon spawn
- `packages/cli/src/lib/builds.ts` — update `pinCurrentBuild` / `hasPinnedBuild` / `rollback` to use `~/.zazigv2/bin/` for binaries
- `packages/cli/src/lib/daemon.ts` — `resolveAgentEntry` checks `~/.zazigv2/bin/zazig-agent` first

### Add
- `packages/cli/src/lib/auto-update.ts` — check version against `agent_versions`, download release assets, replace binaries
- `packages/cli/scripts/compile.sh` — Bun compile wrapper (called by promote)

### Remove (after migration)
- `packages/cli/releases/zazig.mjs` — no longer committed to repo
- `packages/local-agent/releases/zazig-agent.mjs` — no longer committed to repo
- `packages/local-agent/releases/agent-mcp-server.mjs` — no longer committed to repo
- The pinned builds system (`~/.zazigv2/builds/`) — replaced by `~/.zazigv2/bin/`
