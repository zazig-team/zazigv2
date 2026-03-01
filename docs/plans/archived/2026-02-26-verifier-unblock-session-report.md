# Verifier Unblock Session Report

**Date:** 2026-02-26 (evening)
**Author:** CTO agent
**For:** Chris

---

## TL;DR

The pipeline had 13 features stuck in `verifying` — none progressing. We found and fixed the root cause (a git concurrency bug in the verifier), shipped two PRs, restarted the daemon, and got all 13 features flowing through verification. However, we then discovered a second, deeper problem: the reviewer sessions themselves timeout without producing reports. The plumbing is fixed; the reviewer needs work.

---

## What was broken

After the daemon restart (to pick up the CLAUDECODE unset fix from earlier), 13 features immediately got stuck in `verifying`. All verify jobs failed within seconds of being dispatched.

**Root cause:** The verifier runs inside a bare git repo. It calls `git fetch origin` to pull the latest code before creating a worktree. In a bare repo, that fetches ALL branch refs. If any other verify job already has a worktree checked out on any branch, git refuses to update that branch's ref — and the entire fetch fails. One running verify job blocks all others.

**Secondary issue:** Every Realtime broadcast message is delivered twice (known Supabase behaviour). The executor had dedup (from the earlier remediation), but the verifier didn't. Every verify job was processed twice, doubling resource usage and creating worktree races.

---

## What we shipped

### PR #104 — Branch-scoped fetch, dedup, worktree prune
- Changed `git fetch origin` to `git fetch origin <branch>` — only fetches the branch needed for that specific job, so concurrent jobs don't block each other
- Added `inFlightVerifies` Set to deduplicate broadcast messages (same pattern as the executor fix)
- Added `git worktree prune` before each verify to clean stale metadata from crashed runs

### PR #105 — Worktree removal ordering fix
- Moved stale worktree cleanup to happen _before_ the fetch, not after
- If the daemon crashes mid-verify, the stale worktree has the target branch checked out — so the fetch for that same job fails on restart unless you remove the worktree first

---

## Operational work

- Cleaned 3 stale verify worktrees that were blocking the pipeline on startup
- Re-queued stuck verify jobs multiple times (orchestrator kept re-dispatching into the broken daemon)
- Found an orphaned feature (`Terminal-Mode Orchestrator Notifications`) stuck in `verifying` with no verify job — the lifecycle poller silently skips this case. Reset it to `combining` so the poller would create a verify job.
- Rebuilt the daemon, restarted, confirmed 11 concurrent verify jobs running — the fix works

---

## What's still broken: Reviewer sessions

With the plumbing fixed, we can now see the _next_ problem: **the reviewer sessions themselves don't work.**

Every reviewer session:
1. Spawns `claude -p` with the reviewer role prompt
2. Runs for exactly 10 minutes (the timeout)
3. Produces no `.claude/verify-report.md`
4. Gets marked as failed

Zero out of ~20 attempts produced a report. This wasn't visible before because the fetch bug prevented sessions from ever starting. Possible causes:
- 11 concurrent `claude -p` sessions hitting API rate limits
- The reviewer role prompt doesn't instruct the model to write the report in the expected format/path
- Permission prompts or tool calls hanging inside the session
- Model availability issues under concurrent load

**This is the current blocker.** The pipeline mechanics work end-to-end, but verification itself needs the reviewer prompt investigated and likely rewritten.

---

## Open items

| Priority | Issue | Status |
|----------|-------|--------|
| **P0** | Reviewer sessions timeout without report | Needs investigation |
| P2 | Lifecycle gap — features in `verifying` with no verify job get silently skipped | Known, workaround available |
| P2 | Ghost machine `macbook-pro-5-local` still heartbeating | Slots zeroed, mitigated |
| P2 | Worktree cleanup race in executor | Low impact, jobs still complete |
| P3 | Realtime duplicate broadcasts | Mitigated by dedup Sets |

---

## Commits on master

```
391fe1c fix: verifier branch-scoped fetch, dedup, and worktree prune (#104)
??????  fix: move stale worktree removal before fetch in verifier (#105)
0c9523a fix: unset CLAUDECODE in verifier before spawning reviewer session
d9fda26 fix: update stale status references in orchestrator tests and code
2008b3e docs: post-remediation pipeline healthcheck report
cc931a4 fix: apply pipeline remediation updates and migration
```
