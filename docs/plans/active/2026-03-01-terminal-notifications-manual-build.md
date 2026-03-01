# Terminal Notifications: Manual Build Plan

**Date:** 2026-03-01
**Status:** COMPLETE — already on master
**Context:** Feature `d78a3b06` failed 53x in the pipeline, but the code was built manually and merged to master on 2026-02-24. All components are deployed and operational. This doc records what exists so the feature can be marked complete.

**Design spec:** None (built directly from requirements)

---

## What was built (on master)

| Component | Status | Notes |
|-----------|--------|-------|
| `notifyCPO()` in orchestrator | Complete | `supabase/functions/orchestrator/index.ts` lines 1653-1700 |
| 8 notification trigger points | Complete | Throughout orchestrator pipeline stages |
| `handleMessageInbound()` in executor | Complete | `packages/local-agent/src/executor.ts` — routes messages to persistent agents |
| `injectMessage()` in executor | Complete | Uses tmux to send messages to Claude Code terminal |
| `MessageInbound` protocol | Complete | `packages/shared/src/messages.ts` — type-safe message delivery |
| Supabase Realtime channel | Complete | `agent:{machine-name}` broadcast channel |
| Test coverage | Complete | 2 passing tests for notifyCPO |

## Architecture

```
Pipeline event → Orchestrator → notifyCPO(supabase, companyId, text)
  → Supabase Realtime broadcast on channel `agent:{machine-name}`
  → Local Agent Executor (listening) → handleMessageInbound()
  → injectMessage() → tmux send-keys → Claude Code terminal
```

Notifications appear in the CPO's terminal in real time (<100ms latency). Message loss is graceful — logged but non-fatal. CPO catches up on next standup poll.

## Notification Triggers (8 points)

| # | Event | Message Content |
|---|-------|----------------|
| 1 | Breakdown complete | Job count and dispatchable jobs |
| 2 | Project created | Feature outline count |
| 3 | Verification passed | PR ready for review with URL |
| 4 | Verification inconclusive | Test output snippet for triage |
| 5 | Verification failed | Re-queue notification |
| 6 | Test deploy failed | Deploy error message |
| 7 | Verification retry | Explains next step (fix job) |
| 8 | Stuck feature recovery | Explains automatic rollback |

## Manual build steps

**None required.** All code is on master, deployed, and operational.

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | notifyCPO in orchestrator | **Already deployed** | Merged 2026-02-24 |
| 2 | Message handling in executor | **Already deployed** | Part of local-agent build |
| 3 | Realtime channel | **Already active** | No configuration needed |
| 4 | Mark feature complete | **TODO** | SQL below |

### Mark feature complete (SQL Editor)

```sql
UPDATE features
SET status = 'complete',
    updated_at = now()
WHERE id = 'd78a3b06-FULL-UUID-HERE';
```

Note: Need full UUID. Run this to find it:
```sql
SELECT id, title, status FROM features WHERE id::text LIKE 'd78a3b06%';
```

---

## What's deferred

| Component | Status | Notes |
|-----------|--------|-------|
| Configurable notification channels | Not built | Currently hardcoded to CPO via tmux |
| Notification preferences | Not built | No way to mute/filter notifications |
| Non-CPO role notifications | Not built | Only CPO receives notifications currently |
| Notification history | Not built | Messages are ephemeral — no persistence |

## Estimated effort

| Step | Who | Time |
|------|-----|------|
| 1. Verify feature complete | Tom | 1 min |
| 2. Run SQL to mark complete | Tom | 1 min |
| **Total** | | **~2 min** |
