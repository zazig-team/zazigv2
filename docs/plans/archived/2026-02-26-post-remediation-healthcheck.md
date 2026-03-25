# Post-Remediation Health Check — 2026-02-26

Pipeline remediation (commit cc931a4) deployed. Daemon restarted. This report covers verification, new findings, and immediate actions taken.

## Verification Status

| Item | Status | Notes |
|------|--------|-------|
| Daemon running new code | PASS | dist/ contains all remediation code paths |
| Migration 059 deployed | PASS | Confirmed last session |
| Orchestrator deployed | PASS | Confirmed last session |
| Stuck feature 2e9f067c | FIXED | Set to `complete` via SQL — deploy loop stopped |
| Job recovery on startup | PASS | `recoverDispatchedJobs` called with `gracePeriodMs: 0` |
| Pipeline flowing | PASS | 4 jobs executing after recovery, 1 already completed |

## New Finding: Ghost Machine Dispatching (P0)

**Impact:** 12 jobs orphaned for 5+ hours. Pipeline stalled.

**Root cause:** Two machine entries for company `00000000...0001`:

| UUID | Name | Source |
|------|------|--------|
| `9b81671b` | `toms-macbook-pro-2023-local` | Active daemon |
| `b9233ea4` | `macbook-pro-5-local` | Ghost — no daemon, actively heartbeating from unknown source |

The orchestrator's `dispatchQueuedJobs()` picks machines by available slots. The ghost machine had full slots (4 claude_code, 4 codex) so it received dispatch. No daemon ever claims the jobs.

**Actions taken:**
1. Reset 12 stuck jobs to `queued` (machine_id = NULL) — re-dispatched to real machine
2. Zeroed ghost machine slots (claude_code=0, codex=0) — stops future dispatch
3. Also zeroed `fa583364` (macbook-pro-5-local, different company) — same issue

**Remaining risk:** The ghost machine is still heartbeating (last_heartbeat updating every ~30s). If whatever is heartbeating it also registers slots, problem recurs.

**Recommended fix:** Dispatch should check `last_heartbeat` freshness. Machines with heartbeat older than 2 minutes (3 heartbeat cycles) should be excluded from slot allocation. Add to `dispatchQueuedJobs()`:

```sql
WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'
```

**Investigation needed:** What is heartbeating `macbook-pro-5-local`? Candidates:
- Codex cloud workspace with stale config
- Previous daemon instance under different name
- Race in machine registration at startup

## New Finding: Verifier Missing CLAUDECODE Unset (P1)

**Impact:** ALL verification jobs fail immediately. 8 features stuck in `verifying`.

**Root cause:** `verifier.ts:198` spawns `claude -p` without unsetting the `CLAUDECODE` env var. The daemon inherits `CLAUDECODE` from its parent process (launched from a Claude Code tmux session). Claude Code detects this and refuses to start nested sessions.

**Error:** `Claude Code cannot be launched inside another Claude Code session.`

**The executor (`executor.ts:1401`) and fix-agent (`fix-agent.ts:85`) both unset CLAUDECODE. The verifier was missed.**

**Fix:** One-line change in `verifier.ts` around line 198. Change the exec call to prefix with `unset CLAUDECODE;` or pass `env: { ...process.env, CLAUDECODE: undefined }` to the exec options.

```typescript
// Current (broken):
await this.exec("claude", ["-p", sessionPrompt, "--model", "claude-sonnet-4-6"], { cwd: repoDir, timeout: REVIEWER_SESSION_TIMEOUT_MS });

// Fix (option A — shell prefix, matches executor pattern):
const shellCmd = `unset CLAUDECODE; claude -p ${shellEscape([sessionPrompt])} --model claude-sonnet-4-6`;
await this.exec("sh", ["-c", shellCmd], { cwd: repoDir, timeout: REVIEWER_SESSION_TIMEOUT_MS });

// Fix (option B — env override, cleaner):
await this.exec("claude", ["-p", sessionPrompt, "--model", "claude-sonnet-4-6"], {
  cwd: repoDir,
  timeout: REVIEWER_SESSION_TIMEOUT_MS,
  env: { ...process.env, CLAUDECODE: undefined },
});
```

## New Finding: Worktree Cleanup Race in onJobEnded (P2)

**Impact:** Low — job completes but branch may not push on final attempt.

**Root cause:** `onJobEnded` has two push attempts: one during the job (succeeds), one after cleanup (fails because worktree is deleted). Observed on job `c244884f`:
```
Pushed branch job/c244884f...
...
WARN onJobEnded: push failed ... No such file or directory
```

Job still sent `job_complete` successfully, so the combiner should find the branch. But if the first push didn't happen, the branch would be lost.

**Recommended fix:** Guard the second push with a worktree existence check, or remove the redundant push.

## Orchestrator Test Suite — Stale Assertions

**Impact:** Medium — tests document wrong expectations. Not actively blocking pipeline.

### Test file changes needed (`orchestrator.test.ts`):

| Location | Stale Value | Correct Value | Context |
|----------|-------------|---------------|---------|
| Line 848 (comment) | `"testing"` | `"deploying_to_test"` | handleFeatureRejected test |
| Line 854 (assertion) | `"testing"` | `"deploying_to_test"` | Status check after big rejection |
| Line 856 (message) | `"testing"` | `"deploying_to_test"` | Assertion failure message |
| Line 1100 (mock data) | `"done"` | `"complete"` | checkUnblockedJobs dep status |

### Production code cleanup (`orchestrator/index.ts`):

| Location | Issue | Fix |
|----------|-------|-----|
| Line 472 | `d.status === "complete" \|\| d.status === "done"` | Remove `\|\| d.status === "done"` |
| Line 1309 | Same | Same |

`"done"` is not a valid job status in the schema. These are defensive checks for non-existent legacy data.

## Pipeline State After Recovery

Active features flowing through pipeline:
- 4 jobs executing on `toms-macbook-pro-2023-local`
- 1 job already completed (`c244884f` — "Delete stale jobs before re-breakdown")
- 2 jobs queued awaiting dispatch
- Verification jobs failing (CLAUDECODE bug — P1)

## Priority Actions

| Priority | Item | Owner | Effort |
|----------|------|-------|--------|
| P0 | Ghost machine — zeroed slots (done) | CTO (done) | 0 |
| P1 | Verifier CLAUDECODE unset | Engineer | 10 min |
| P1 | Ghost machine heartbeat investigation | Tom | 30 min |
| P2 | Dispatch heartbeat check | Engineer | 30 min |
| P2 | Worktree cleanup race | Engineer | 15 min |
| P2 | Orchestrator test fixes | Engineer | 15 min |
| P3 | Ghost machine cleanup (delete or archive) | Engineer + migration | 30 min |
