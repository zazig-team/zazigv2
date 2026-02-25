STATUS: COMPLETE

# CPO Report — Terminal-First CPO 3.1: Per-company daemon management + company picker

**Branch:** `cpo/tfc-daemon`
**Trello card:** 699e436b
**Commit:** `71b9904` — `feat(cli): per-company daemon PID management + company picker`

## Summary

Implemented Tasks 3-4 from the terminal-first CPO plan:

### Change 1: `packages/cli/src/lib/daemon.ts`
Added 6 per-company daemon management functions at the end of the file, preserving all existing functions:
- `pidPathForCompany(companyId)` — returns `~/.zazigv2/{companyId}.pid`
- `logPathForCompany(companyId)` — returns `~/.zazigv2/logs/{companyId}.log` (creates log dir)
- `readPidForCompany(companyId)` — reads PID from company-specific PID file
- `isDaemonRunningForCompany(companyId)` — checks if company daemon process is alive
- `removePidFileForCompany(companyId)` — cleans up PID file
- `startDaemonForCompany(env, companyId)` — spawns detached daemon with company-scoped PID/log files

No new imports needed — all dependencies (`spawn`, `openSync`, `readFileSync`, `writeFileSync`, `unlinkSync`, `mkdirSync`, `join`, `isRunning`, `resolveAgentEntry`, `ZAZIGV2_DIR`) were already present.

### Change 2: `packages/cli/src/lib/company-picker.ts` (new file)
- `fetchUserCompanies(supabaseUrl, anonKey, accessToken)` — fetches companies via Supabase REST (`user_companies` join `companies`)
- `pickCompany(companies)` — auto-selects if single company, prompts via readline if multiple

## Typecheck
- `npx tsc -p packages/cli/tsconfig.json --noEmit` passes with zero new errors
- Pre-existing error in `constants.ts` (unresolved `@zazigv2/shared` module) confirmed on base branch — not introduced by this change

## Token Usage
- Token budget: claude-ok (wrote code directly)
- Approach: direct implementation, no codex-delegate needed for 2 focused changes
