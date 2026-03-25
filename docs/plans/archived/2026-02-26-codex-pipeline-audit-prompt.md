# Independent Pipeline Audit — Codex Prompt

## Your mission

You are doing an independent end-to-end audit of the zazigv2 pipeline. Two days have been spent fixing bugs in this pipeline and we need fresh eyes to find anything still broken, any race conditions, any silent failures, any paths that will stall a feature forever.

**Read-only. Do not modify any files. Produce a findings report.**

## Architecture overview

This is an AI agent orchestration pipeline:

- **Orchestrator**: Supabase Edge Function at `supabase/functions/orchestrator/index.ts` (~3000 lines). Runs on a 10-second cron. Manages feature lifecycle, dispatches jobs to machines, handles agent messages.
- **Local Agent**: Node.js daemon at `packages/local-agent/` — runs on developer's machine. Receives jobs via Supabase Realtime broadcasts, spawns Claude Code / Codex sessions in tmux to execute them.
- **Shared types**: `packages/shared/` — message types, validators, test recipe schema.
- **Communication**: Supabase Realtime channels. Orchestrator broadcasts to `agent:<machineName>`, agent sends to `orchestrator:commands`.

### Feature lifecycle
```
created → ready_for_breakdown → breaking_down → building → combining → verifying → deploying_to_test → [ready_to_test] → deploying_to_prod → complete
```

Each transition is driven by either:
1. An agent message (e.g. job_complete, deploy_complete)
2. A catch-up poller in `processFeatureLifecycle()` that runs every 10s

### Key components in local-agent (`packages/local-agent/src/`):
- `index.ts` — daemon entry, Realtime channel setup, message routing
- `executor.ts` — spawns Claude Code / Codex sessions in tmux for jobs
- `branches.ts` — git worktree management, branch creation, merging
- `verifier.ts` — runs verification jobs (creates worktree from bare repo, spawns Claude)
- `test-runner.ts` — handles deploy_to_test (creates worktree from bare repo, reads zazig.test.yaml, runs deploy/healthcheck)
- `combiner.ts` — merges job branches into feature branch

### Critical context: bare repo
The repo clone at `~/.zazigv2/repos/<repoName>/` is a BARE git clone (no working tree). Any component that needs to read files must create a git worktree first. This was the root cause of multiple bugs this week.

## What to audit

Trace every feature lifecycle transition end-to-end. For each transition, verify:

1. **The happy path works**: message sent → received → processed → status updated → next transition triggered
2. **Failure handling**: what happens when any step fails? Does the feature stall forever or recover?
3. **The catch-up poller covers it**: if the Realtime broadcast is missed (known flaky), does `processFeatureLifecycle()` recover?
4. **No silent bypasses**: a failure should not silently advance the feature
5. **No infinite loops**: failed→retry→failed should eventually cap out

### Specific areas of concern:

#### A. Realtime broadcast reliability
The orchestrator's broadcast pattern (subscribe → send → unsubscribe) is fire-and-forget. We've observed messages not reaching the agent. Check:
- Every place the orchestrator sends a broadcast — is there a catch-up poller backup?
- Is the subscribe/send/unsubscribe pattern in `initiateTestDeploy`, `dispatchJob`, etc. robust? Race conditions?

#### B. Bare repo / worktree handling
Every local-agent component that reads repo files needs worktree checkout. Check:
- `verifier.ts` — does it create worktree? ✓ (fixed)
- `test-runner.ts` — does it create worktree? ✓ (just fixed)
- `combiner.ts` — does it use worktrees correctly?
- `branches.ts` — worktree creation/cleanup, any stale worktree issues?
- `executor.ts` — does it need repo access?
- Any OTHER file that reads from the repo path?

#### C. Silent verification bypass (KNOWN ISSUE)
Features reportedly progress past `verifying` even when verification fails. Trace:
- What happens when a verify job completes with a non-PASSED result?
- Does the catch-up poller for `verifying` handle this correctly?
- Is there a path where verify failure → feature advances anyway?

#### D. Concurrency / race conditions
- Two features deploying to test simultaneously?
- Two jobs writing to the same worktree?
- Repo clone contention (`~/.zazigv2/repos/` has no locking)
- Multiple `deploy_to_test` broadcasts received for the same feature (we've seen duplicate messages)
- What happens if `processFeatureLifecycle` runs while a previous invocation is still processing?

#### E. deploying_to_test stuck recovery
- The stuck recovery rolls back to `verifying` after 5 minutes, caps at 3 retries/hour
- But each retry creates a worktree, runs deploy, etc. — are worktrees cleaned up between retries?
- What if the deploy SUCCEEDS but the `deploy_complete` message is lost?

#### F. Message handling in index.ts
- How does the agent route incoming messages? Is every message type handled?
- What happens with unknown message types?
- Duplicate message handling (we see double-delivery of broadcasts)

#### G. Job dispatch → execution → completion
- Job dispatched but tmux session dies — is this recovered?
- Job completes but `job_complete` message lost — does the catch-up poller handle it?
- DAG dependencies — are they correctly enforced?

## Output format

Produce a markdown report with:

```markdown
# Pipeline Audit Findings

## Critical (will cause pipeline stalls or data corruption)
- Finding 1: [file:line] description + evidence

## High (likely to cause issues in production)
- Finding 2: [file:line] description + evidence

## Medium (edge cases, robustness gaps)
- Finding 3: ...

## Low (code quality, logging gaps)
- Finding 4: ...

## Confirmed Working
- List of transitions/paths verified as correct
```

For each finding, include:
- Exact file and line number
- The specific scenario that triggers the bug
- Whether there's a catch-up poller that compensates
- Suggested fix (one sentence)

## Files to read (in priority order)
1. `supabase/functions/orchestrator/index.ts` — the orchestrator (start here)
2. `packages/local-agent/src/index.ts` — daemon entry + message routing
3. `packages/local-agent/src/test-runner.ts` — deploy flow
4. `packages/local-agent/src/verifier.ts` — verification flow
5. `packages/local-agent/src/combiner.ts` — merge flow
6. `packages/local-agent/src/branches.ts` — git/worktree management
7. `packages/local-agent/src/executor.ts` — job execution
8. `packages/shared/src/` — message types, protocol
9. `zazig.test.yaml` — test recipe (at repo root)
