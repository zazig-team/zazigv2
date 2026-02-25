# CPO Report — Terminal-First CPO 5.1

**STATUS: COMPLETE**

**Branch:** `cpo/tfc-cli`
**Trello Card:** 699e438b
**Commit:** `8213a46` — `feat(cli): company picker + TUI in start/stop, fix chat() daemon check`

## Summary

Implemented Tasks 7-9 from the Terminal-First CPO plan: rewrote `start.ts` and `stop.ts` with company picker support, created `chat.ts` with TUI and fixed `isDaemonRunningForCompany` usage, and registered the `chat` command in `index.ts`.

## Changes

### New Files
- **`packages/cli/src/commands/chat.ts`** — Split-screen TUI (blessed) with `launchTui()`, `discoverAgentSessions()`, and `chat()` function using `isDaemonRunningForCompany` (fixing the 4.1 bug)
- **`packages/cli/src/lib/company-picker.ts`** — `fetchUserCompanies()` and `pickCompany()` helpers for multi-company selection

### Modified Files
- **`packages/cli/src/commands/start.ts`** — Rewrote with `--company` and `--no-tui` flags, company picker, per-company PID files (`startDaemonForCompany`), 3s wait + session discovery, TUI launch
- **`packages/cli/src/commands/stop.ts`** — Rewrote with company picker + per-company PID teardown via `readPidForCompany`/`removePidFileForCompany`
- **`packages/cli/src/lib/daemon.ts`** — Added per-company functions: `pidPathForCompany`, `logPathForCompany`, `readPidForCompany`, `isDaemonRunningForCompany`, `removePidFileForCompany`, `startDaemonForCompany`
- **`packages/cli/src/index.ts`** — Registered `chat` command + updated help text
- **`packages/cli/package.json`** — Added `blessed` + `@types/blessed` dependencies

### Key Behaviors
- `zazig start`: credentials -> config -> company picker (or `--company` flag) -> already-running check -> spawn daemon with `ZAZIG_COMPANY_ID`/`ZAZIG_COMPANY_NAME` env -> wait 3s -> discover tmux sessions -> launch TUI (or `--no-tui` for headless)
- `zazig stop`: credentials -> company picker -> per-company PID lookup -> SIGTERM -> 10s grace -> SIGKILL fallback
- `zazig chat`: credentials -> company picker -> `isDaemonRunningForCompany` check -> discover sessions -> launch TUI (read-only reconnect, daemon keeps running on Ctrl+C)

## Typecheck

Only pre-existing error remains: `@zazigv2/shared` module not found in `constants.ts` (not introduced by this change).

## Token Usage

Single-session implementation -- no subagents or teams used. Direct code writing per `claude-ok` budget.
