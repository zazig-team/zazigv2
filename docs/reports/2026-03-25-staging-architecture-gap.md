# Staging Environment: Architecture Gap Report

**Date:** 2026-03-25
**Reviewed by:** Codex (independent second opinion, same date)

## Summary

The `zazig-staging` environment does not reliably reflect the latest master branch across all machines. Each machine runs its own local repo checkout via Bun — there is no shared staging rollout, no CI pipeline keeping machines current, and weak observability into what code is actually running. The original approved design ("master is staging, CI auto-deploys") was never implemented.

---

## How Production Works (correctly)

`zazig start` resolves the daemon from `~/.zazigv2/bin/zazig-agent` — a standalone, self-contained binary that is:
- Built explicitly via `zazig promote`
- Version-bumped and committed to git as `chore: update production bundles and bump version to X.X.X`
- Auto-updated on every machine at startup via the `agent_versions` table

This is deterministic. Every machine running production runs the same versioned artifact.

---

## How Staging Actually Works

`scripts/zazig-staging` in the repo runs Bun directly against TypeScript source:

```bash
ZAZIG_REPO_PATH="$REPO_ROOT" exec bun "$REPO_ROOT/packages/cli/src/staging-index.ts" "$@"
```

`resolveAgentEntry()` in `daemon.ts` explicitly returns `src/index.ts` for staging (added March 17). So staging does run current source — but only current source **on that specific machine**. There is no mechanism to ensure all staging machines are on the same commit, or even that they have pulled recently.

---

## The Real Gap

Staging and production are operationally different — production auto-updates to a shared artifact; staging is per-machine and per-checkout. The problem is not "wrong code path" but **no deterministic shared staging rollout**.

Three specific issues:

**1. Per-machine drift.** Each machine runs whatever `git pull` last happened on it. Two machines can be running materially different code with no visibility into the difference.

**2. Weak version reporting.** `resolveAgentVersion()` derives a version from the latest commit touching `packages/local-agent/src/` only. Changes to `packages/shared/` that affect runtime behaviour are invisible to this version string.

**3. Staging not registered in `agent_versions`.** The `agent-inbound-poll` edge function compares running agents against `agent_versions` for version checks — but staging agents are never registered there. The TODO exists in `staging-index.ts` but is unimplemented.

The original approved design (`docs/plans/archived/2026-03-03-staging-promote-pipeline-design.md`) states: *"master is staging — CI auto-deploys on every merge."* That CI step was never built.

---

## Options to Fix

**Option A — CI-built staging artifact (recommended)**
On every merge to master, CI builds a staging artifact keyed by commit SHA and publishes it. `zazig-staging start` auto-updates to that SHA before spawning the daemon — same model as production auto-update. This matches the original approved design intent and makes staging genuinely shared and deterministic. Also register staging agents in `agent_versions` so version drift is visible.

**Option B — Accept staging is developer-local only**
Keep the current Bun-from-source approach but add hard observability: show the running commit SHA, current HEAD, dirty working tree state, and a "restart required" banner when they differ. Widen `resolveAgentVersion()` to include `packages/shared/` changes. Register staging agents in `agent_versions`. Explicitly document that staging is a personal dev environment, not a shared pre-production gate.

**Option C — Manual `zazig promote --staging` (not recommended)**
Introduce a staging label in the builds system and commit staging bundles to git without a version bump. This was the original Option B in the first draft of this report; Codex's review correctly identified it as the wrong approach — it adds git churn, merge noise, and a second manual gate, solving nothing that Option A doesn't solve better automatically.

---

## Recommendation

Option A. The original approved design already called for CI-driven staging. Option B is acceptable if staging is explicitly scoped as a dev tool and never treated as a shared pre-production environment. Option C should not be pursued.

---

## Note on Earlier Draft

An earlier version of this report incorrectly diagnosed the mechanism: it stated that staging ran from `packages/local-agent/dist/index.js` and that dist staleness was the root cause. That analysis was based on the installed CLI binary in the fnm path rather than the repo's `scripts/zazig-staging`. The dist-based path was replaced with Bun-from-source on March 17. Options in the earlier draft were revised accordingly following an independent Codex review.
