# Review: Triggers and Events System Design (V2.1 → V2.2)
Reviewed: 2026-02-22
Source: `docs/plans/2026-02-22-triggers-and-events-design.md`
Reviewers: Claude (review-plan walkthrough), gpt-5.3-codex (second opinion on review findings)

## Verdict

**V2.2 is ready to cardify.** All 16 gaps identified during the V2.1 review have been resolved in the design doc. The 6 blockers (Postgres-to-Realtime bridge, heartbeat receiver, budget tracking, lane model contradiction, orphan sessions, cron next_run_at) are now specified. The 5 significant gaps (dual injection paths, estop scope, stale SQL, estop epoch broadcast, cheap-check terminology) are fixed. The 5 worth-noting items are addressed or explicitly deferred. No remaining open questions block implementation.

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| `agent_events` claim/ack schema | Events Queue | ONE-WAY DOOR | Column names and semantics are hard to change once local agents are deployed and running against them |
| `estop_epoch` monotonic counter | Emergency Stop | ONE-WAY DOOR | All machines and the orchestrator must agree on epoch semantics — changing this later requires coordinated rollout |
| Postgres stored procedures for queue ops | Events Queue | HARD TO REVERSE | Once queue logic is in Postgres, moving it to Edge Functions requires rewriting all callers. Correct choice, but commit to it. |
| `daily_spend` table schema | Budget Tracking | HARD TO REVERSE | Cost estimation model (per-model token rates) becomes a contract once hooks depend on it |
| 2 lanes (main + background) | Lanes | Reversible | Easy to split `main` into `main` + `cron` later by adding a column value. Good starting point. |
| Hardcoded hooks → DB hooks | Hooks | Reversible | Clean upgrade path. `runHooks` interface stays the same. |

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| Orchestrator dispatch loop (lane-aware) | 2026-02-18 orchestrator design | **NEEDS UPDATE** — current dispatch ignores lanes |
| Messaging system (Slack inbound/outbound) | 2026-02-22 messaging design | Designed. V2.2 adds note: **unify injection path** — Slack messages should enqueue as `agent_events` |
| Pipeline state machine (`verifying` state) | 2026-02-20 pipeline design | Designed. V2.2 adds `verifying` to estop transition. |
| Daily API spend tracking | **V2.2: Budget Tracking subsection** | RESOLVED — `daily_spend` table + `accumulate_daily_spend` RPC |
| Heartbeat receiver (cloud-side processor) | **V2.2: Heartbeat Receiver subsection** | RESOLVED — HTTP POST to `heartbeat` Edge Function |
| Postgres-to-Realtime bridge for wake broadcasts | **V2.2: Wake Broadcast subsection** | RESOLVED — Edge Functions broadcast after RPC; scheduler accepts 60s poller |
| Cron expression parser for `next_run_at` | **V2.2: `compute_next_run()` function** | RESOLVED — pre-compute on create/update, TypeScript library for phase 1 |

## Key Trade-offs

- **Postgres RPCs over Edge Functions for queue ops**: Gains correctness (`FOR UPDATE SKIP LOCKED`), loses visibility (harder to debug/log than Edge Functions). Worth it — queue correctness is non-negotiable.
- **2 lanes over 3**: Gains simplicity, loses cron isolation. At 2 machines / 4 agents, cron jobs competing with main work is a theoretical problem — revisit if cron jobs start starving.
- **Hardcoded hooks first**: Gains shipping speed, loses configurability. Correct for phase 1. The hook *interface* is designed for DB-configurable — only the backend changes.
- **Local manifest + DB reconciliation for restart recovery**: Gains fast recovery within heartbeat window, costs local state management. V2.2 adds orphan session discovery for belt-and-suspenders coverage.
- **Claim/ack over drain-and-pray**: Gains reliability, costs an extra round-trip per wake cycle. Correct trade — silent event loss at LLM-call cost is worse than one extra DB call.
- **Token-based budget tracking over Anthropic Usage API**: Gains immediacy (no API polling delay), loses precision (estimated vs actual billing). Sufficient for circuit-breaker thresholds — exact billing reconciliation can use the API later.

## Gaps: Original 11 (all resolved in V2.2)

### Blocking (3 → all resolved)

| # | Gap | Resolution in V2.2 |
|---|-----|-------------------|
| 1 | No Postgres-to-Realtime bridge | Wake Broadcast subsection: Edge Functions broadcast after RPC; scheduler accepts 60s poller latency |
| 2 | Heartbeat receiver unspecified | Heartbeat Receiver subsection: HTTP POST to `heartbeat` Edge Function |
| 3 | Budget tracking undesigned | Budget Tracking subsection: `daily_spend` table + `accumulate_daily_spend()` RPC |

### Significant (4 → all resolved)

| # | Gap | Resolution in V2.2 |
|---|-----|-------------------|
| 4 | Dual injection paths | Note added: unify in messaging design — Slack messages enqueue as `event_type='message'` |
| 5 | Estop misses pipeline states | Added `verifying` to estop transition (Codex confirmed `deploying` doesn't exist in pipeline) |
| 6 | Orphaned tmux sessions | Orphan session discovery on startup: `tmux ls` → cross-reference manifest + DB |
| 7 | Retention SQL references `drained_at` | Updated to `acked_at` |

### Worth Noting (4 → all resolved or explicitly deferred)

| # | Gap | Resolution in V2.2 |
|---|-----|-------------------|
| 8 | Cron `next_run_at` placeholder | Pre-compute on create/update + `compute_next_run()` function. Phase 1: TypeScript `cron-parser` library. |
| 9 | Company resolution for webhooks | Lookup company_id from webhook secret (each company has unique secret per source) |
| 10 | Phase 1 `runHooks` code missing | Added `BUILTIN_HOOKS` map code sample alongside Phase 2 DB-driven version |
| 11 | No observability design | Deferred to implementation card — add structured logging conventions |

## Codex Second Opinion: Additional Findings (3 → all resolved in V2.2)

Codex validated all 11 gaps from the review walkthrough and found 3 additional internal contradictions introduced by the V2.1 bulk edits:

| # | Finding | Severity | Resolution in V2.2 |
|---|---------|----------|-------------------|
| A | Lane model contradiction — `scheduled_jobs.lane` defaults `'cron'` but `jobs.lane` CHECK only allows `'main'\|'background'` | Blocking | Default changed to `'background'`; seed data sets `'main'` explicitly for work jobs |
| B | Estop epoch missing from broadcast payload — ACK protocol expects epoch but broadcast doesn't include it | Significant | Added `epoch` to broadcast payload; epoch incremented before broadcast |
| C | Stale "drained" language in cheap-check section after V2.1 renamed to claim/ack | Significant | Updated all references to claim/ack terminology |

### Codex Severity Adjustments (accepted)

| Gap | Original | Codex Rating | Reasoning |
|-----|----------|-------------|-----------|
| #5 (Estop misses pipeline states) | Significant | Narrowed | `deploying` doesn't exist in pipeline design — only add `verifying` |
| #6 (Orphaned tmux sessions) | Significant | Upgraded to Blocking | Invisible zombie agents burning budget = same severity as budget tracking |
| #8 (Cron `next_run_at`) | Worth Noting | Upgraded to Blocking | Scheduler is a no-op without next_run_at computation |

## Open Questions (Updated)

Original open questions 1-7 from the design doc still stand. Review questions resolved:

| # | Question | Status |
|---|----------|--------|
| 8 | Heartbeat transport | **RESOLVED** — HTTP POST to Edge Function |
| 9 | Budget data source | **RESOLVED** — Token counts from JobResult, accumulated in `daily_spend` table |
| 10 | Wake broadcast after Postgres enqueue | **RESOLVED** — Edge Functions broadcast; scheduler uses 60s poller |
| 11 | Slack message path | **RESOLVED** — Unify with events queue (note added to design doc) |
| 12 | Orphan session handling | **RESOLVED** — Kill unrecognized sessions on startup |

## Next Steps

The design doc (V2.2) is ready to **cardify**. All blocking, significant, and worth-noting gaps have been resolved or explicitly deferred. Three rounds of review (V1 Codex+Gemini, V2 Codex+Gemini, V2.1 review-plan+Codex) have hardened the design across 9 subsystems.
