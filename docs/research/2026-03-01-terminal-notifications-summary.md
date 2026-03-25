# Terminal Notifications Feature — Executive Summary

**Feature ID:** d4f1866  
**Status:** Merged to master (2026-02-24)  
**Components:** Orchestrator, Local Agent, Supabase Realtime  
**Code Status:** Fully implemented, tested, deployed

---

## What It Does

Terminal Notifications deliver real-time messages from the orchestrator directly to the CPO's Claude Code session, bypassing the need for polling. When the pipeline reaches important milestones (features broken down, verification passes, tests fail), the CPO sees an instant notification in the terminal.

**Example notification in CPO's terminal:**
```
[Message from orchestrator, conversation:internal:notification:abc123...]
Feature "User Auth Flow" broken into 7 jobs. 3 immediately dispatchable (no dependencies).
```

---

## Architecture (High Level)

```
Pipeline Event
    ↓
Orchestrator calls notifyCPO(companyId, message)
    ↓
Supabase Realtime broadcast to agent:{machine-name}
    ↓
Local Agent executor receives MessageInbound
    ↓
Message queued and injected into tmux session
    ↓
Claude Code displays message in interactive terminal
    ↓
CPO sees notification immediately (no refresh needed)
```

---

## Code Locations

| Component | File | Key Function | Lines |
|-----------|------|--------------|-------|
| **Orchestrator** | `supabase/functions/orchestrator/index.ts` | `notifyCPO()` | 1653-1700 |
| **Orchestrator** | `supabase/functions/orchestrator/index.ts` | 8 trigger points | 1191, 1250, 1269, 1299, 1316, 1343, 2608, 3023+ |
| **Local Agent** | `packages/local-agent/src/executor.ts` | `handleMessageInbound()` | See handler |
| **Local Agent** | `packages/local-agent/src/executor.ts` | `injectMessage()` | See tmux logic |
| **Shared** | `packages/shared/src/messages.ts` | `MessageInbound` interface | Type definition |
| **Tests** | `supabase/functions/orchestrator/orchestrator.test.ts` | 2 passing tests | notifyCPO coverage |

---

## Notification Triggers (8 Points in Pipeline)

1. **Breakdown Complete** — CPO sees job decomposition count and dispatchable jobs
2. **Project Created** — CPO sees feature outline count for new project
3. **Verification Passed** — CPO sees PR ready for review (with URL if available)
4. **Verification Inconclusive** — CPO sees test output snippet, needs manual judgment
5. **Verification Failed** — CPO sees test failure, feature re-queued
6. **Test Deploy Failed** — CPO sees deploy error
7. **Verification Retry** — CPO sees next step (building with fix job)
8. **Stuck Feature Recovery** — CPO sees automatic recovery action

---

## Technical Requirements

### Database
- `jobs` table: `role`, `status`, `company_id`, `machine_id` columns
- `machines` table: `id`, `name` columns
- Active CPO job must have `machine_id` assigned (job status: "dispatched" or "executing")

### Infrastructure
- Supabase Realtime channels enabled for `agent:*` namespace
- Orchestrator edge function deployed
- Local agent with executor supporting `handleMessageInbound`

### System
- tmux available on local agent machine (standard on macOS/Linux)
- Claude Code running in interactive TUI mode
- Message queue capped at 100 items (configurable)

---

## How It Works (Step-by-Step)

### 1. Orchestrator Sends

```typescript
// When breakdown completes:
await notifyCPO(supabase, companyId, 
  `Feature "${title}" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable.`
);
```

### 2. notifyCPO Function

1. Query: Find CPO job for company (role="cpo", status in ["dispatched", "executing"])
2. Query: Resolve machine name from job's machine_id
3. Build: Create MessageInbound payload with unique conversationId
4. Send: Broadcast via Supabase Realtime to `agent:{machine-name}` channel
5. Log: Success message with first 100 chars

### 3. Local Agent Receives

```typescript
// Realtime channel broadcasts message_inbound event
handleMessageInbound(msg) {
  // Route to correct persistent agent (role-aware)
  // Format message with sender and conversationId prefix
  // Queue for injection
}
```

### 4. Message Injection

```typescript
// Check if Claude Code is ready (>15 seconds old)
// Normalize newlines (tmux treats \n as Enter key)
// Execute: tmux send-keys -l "{message}"
// Execute: tmux send-keys Enter
// Log: Success
```

### 5. CPO Sees

```
[Message from orchestrator, conversation:internal:notification:{uuid}]
Feature "User Auth Flow" broken into 7 jobs. 3 immediately dispatchable (no dependencies).
```

---

## Error Handling

| Scenario | Action |
|----------|--------|
| No active CPO | Warning logged, message lost (CPO catches up on next wakeup) |
| CPO has no machine_id | Warning logged, message lost (CPO not yet assigned to machine) |
| Machine not found | Error logged, message lost (machine deleted?) |
| Realtime fails | Message lost silently (CPO will poll on next iteration) |
| tmux not found | Error logged, executor continues (no message to CPO) |
| Message queue full | Message dropped with warning (queue cap: 100) |

All failures are non-fatal — pipeline continues, notifications are best-effort.

---

## Performance & Limits

- **Latency:** <100ms from orchestrator to CPO terminal (Realtime + tmux overhead)
- **Throughput:** Up to 100 queued messages per agent session
- **Message size:** No hard limit (tmux has no char limit, message normalized to single line)
- **Startup delay:** 15 seconds grace period after CPO session spawn (Claude Code initialization)
- **Dependencies:** None beyond Supabase Realtime (no queue service, no DB writes)

---

## Manual Build Checklist

To verify terminal notifications work after manual build:

```
[ ] Orchestrator edge function deployed with notifyCPO() function
[ ] Local agent built with handleMessageInbound() handler
[ ] Supabase Realtime channels enabled for agent:* namespace
[ ] CPO job dispatched to a machine with machine_id assigned
[ ] tmux available on local agent machine
[ ] Deno tests pass: "notifyCPO — sends MessageInbound to CPO machine"
[ ] Message appears in CPO terminal after pipeline event
[ ] Logs show: [orchestrator] Notified CPO on machine {name}: ...
[ ] Logs show: [executor] Injected message into session={name}
```

---

## Known Limitations

1. **No persistence** — Messages only reach active sessions, not stored
2. **Message loss on offline CPO** — If no active CPO, message is logged and lost
3. **No ordering guarantees** — High volume could see out-of-order delivery (informational only)
4. **tmux dependency** — Requires tmux available on local agent
5. **Startup delay** — 15-second grace period prevents interrupting Claude Code boot

---

## Testing

Two tests verify the notification system:

**Test 1: notifyCPO — sends MessageInbound to CPO machine**
- Mocks active CPO job query
- Mocks machine name resolution
- Verifies Realtime channel operations
- Status: PASSING

**Test 2: notifyCPO — no active CPO → no channel operations**
- Mocks empty CPO query result
- Verifies no machine lookup occurs
- Verifies graceful handling of offline CPO
- Status: PASSING

**Run tests:**
```bash
cd zazigv2
deno test supabase/functions/orchestrator/orchestrator.test.ts --allow-all
```

---

## Integration Points

When writing manual documentation, cover these integration points:

1. **Orchestrator → Supabase:** Standard Supabase JS client
2. **Supabase → Local Agent:** Realtime channel subscription
3. **Local Agent → tmux:** System tmux send-keys command
4. **tmux → Claude Code:** TUI auto-queues typed input
5. **Protocol:** Shared MessageInbound type (no serialization)

All integration points are standard — no custom protocols or infrastructure.

---

## For Manual Build Documentation

**Structure recommended:**

1. **System Overview** — Diagram showing data flow end-to-end
2. **Message Protocol** — Show MessageInbound JSON structure and routing
3. **Operational Flow** — Step-by-step walkthrough from event to terminal
4. **Notification Catalog** — Table of all 8 triggers, messages, when they occur
5. **Setup & Verification** — Checklist to verify correct operation
6. **Troubleshooting** — Common issues (no CPO, machine_id null, tmux missing)
7. **Logs & Debugging** — What to look for in logs, how to monitor Realtime
8. **Code References** — Line numbers for each component

---

## Recent History

- **2026-02-24:** Feature d4f1866 merged to master
- **2026-02-25+:** 8 additional commits refining pipeline (zombie prevention, lifecycle fixes)
- **Current:** Feature fully operational on master branch

No breaking changes since merge. All code stable for manual build documentation.

---

## Files for Reference

1. `/Users/tomweaver/Documents/GitHub/zazigv2/supabase/functions/orchestrator/index.ts` — Orchestrator with notifyCPO
2. `/Users/tomweaver/Documents/GitHub/zazigv2/packages/local-agent/src/executor.ts` — Local agent handlers
3. `/Users/tomweaver/Documents/GitHub/zazigv2/packages/shared/src/messages.ts` — Protocol definitions
4. `/Users/tomweaver/Documents/GitHub/zazigv2/supabase/functions/orchestrator/orchestrator.test.ts` — Test suite

All files are in master branch, ready for build documentation.

