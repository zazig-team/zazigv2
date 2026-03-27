# Terminal Notifications Feature Research

**Feature ID:** d4f1866 (merged to master 2026-02-24)  
**Title:** "feat: add DAG-aware job dispatch and CPO notification system (#91)"

## Overview

The Terminal Notifications feature implements a real-time notification system that delivers messages from the orchestrator directly to the CPO's Claude Code session via tmux message injection. This allows the orchestrator to proactively inform the CPO of critical pipeline events without requiring the CPO to poll for status.

---

## Architecture

### Message Flow

```
Orchestrator (Edge Function)
    ↓ (notifyCPO)
Supabase Realtime Channel: agent:{machine-name}
    ↓ (broadcast)
Local Agent (Executor)
    ↓ (handleMessageInbound)
Message Queue
    ↓ (enqueueMessage / injectMessage)
tmux session
    ↓ (send-keys)
Claude Code Interactive TUI
```

### Key Components

#### 1. Orchestrator — `supabase/functions/orchestrator/index.ts`

**Function:** `notifyCPO(supabase, companyId, text)`

```typescript
export async function notifyCPO(
  supabase: SupabaseClient,
  companyId: string,
  text: string,
): Promise<void>
```

**Steps:**
1. Query `jobs` table for active CPO job:
   - `role = "cpo"`
   - `status IN ["dispatched", "executing"]`
   - `company_id = {companyId}`
   - Limit 1 (first active CPO)

2. If no active CPO found: log warning and return (message lost — CPO will catch up on next wakeup)

3. Query `machines` table to get machine name for CPO's machine_id

4. Build `MessageInbound` payload:
   ```typescript
   {
     type: "message_inbound",
     protocolVersion: PROTOCOL_VERSION,
     conversationId: `internal:notification:{random-uuid}`,
     from: "orchestrator",
     text: text
   }
   ```

5. Subscribe to Supabase Realtime channel `agent:{machine-name}`

6. Send broadcast event `message_inbound` with payload

7. Unsubscribe and log completion

**Error Handling:**
- If CPO query fails: log error and return
- If machine query fails: log error and return
- Missing `machine_id` on CPO job: warning and return (CPO not yet assigned to machine)

---

#### 2. Local Agent — `packages/local-agent/src/executor.ts`

**Handler:** `handleMessageInbound(msg: MessageInbound)`

```typescript
handleMessageInbound(msg: MessageInbound): void {
  // Determine target role: msg.role > sole running agent > error
  const targetRole = msg.role ?? (this.persistentAgents.size === 1 
    ? this.persistentAgents.keys().next().value 
    : undefined);

  if (!targetRole) {
    console.warn(`[executor] MessageInbound dropped — multiple agents, no role specified`);
    return;
  }

  const agent = this.persistentAgents.get(targetRole);
  const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]\n${msg.text}`;
  void this.enqueueMessage(formatted, agent.tmuxSession, agent.startedAt);
}
```

**Message Queue:** `private enqueueMessage(message, sessionName, startedAt, type = "human")`

- Queues message in `this.messageQueue` (max cap: `MAX_QUEUE_SIZE`)
- Triggers `processMessageQueue()` if not already running

**Message Processing:** `private async processMessageQueue()`

- Drains queue sequentially
- Calls `injectMessage()` for each queued item
- Resolves/rejects promises on success/failure

**Message Injection:** `private async injectMessage(message, sessionName, startedAt)`

```typescript
private async injectMessage(message: string, sessionName: string, startedAt: number): Promise<void> {
  // Wait for Claude Code to initialize if session is <15 seconds old
  const elapsed = Date.now() - startedAt;
  if (elapsed < CPO_STARTUP_DELAY_MS) {  // 15 seconds
    const wait = CPO_STARTUP_DELAY_MS - elapsed;
    await sleep(wait);
  }

  // Normalize newlines (tmux treats literal \n as Enter key)
  const singleLine = message.replace(/\r?\n/g, " ");

  // Inject text (literal mode) and press Enter
  await execFileAsync("tmux", ["send-keys", "-t", sessionName, "-l", singleLine]);
  await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);
}
```

**Constants:**
- `CPO_STARTUP_DELAY_MS = 15_000` — wait time for Claude Code TUI to initialize after session spawn
- No other configuration needed — all routing is automatic

---

## Notification Triggers

The orchestrator sends notifications at these points in the pipeline:

### 1. **Breakdown Complete**
- **Trigger:** `handleJobComplete` when `job.job_type === "breakdown"`
- **Message Format:**
  ```
  Feature "{title}" broken into {totalJobs} jobs. {dispatchable} immediately dispatchable (no dependencies).
  ```
- **Data:** Query feature title and job dependency graph
- **Purpose:** CPO sees work decomposition results immediately

### 2. **Project Created**
- **Trigger:** `handleJobComplete` when `job.role === "project-architect"`
- **Message Format:**
  ```
  Project "{projectName}" created with {featureCount} feature outlines. Ready for your review.
  ```
- **Data:** Parse context for `projectId` and `projectName`, count features
- **Purpose:** Inform CPO of new project structure

### 3. **Verification Complete (Passed)**
- **Trigger:** `handleJobComplete` when `job.job_type === "combine"` and verification passed
- **Message Format:**
  ```
  Feature "{title}" verified — PR ready for review: {prUrl}
  ```
  or
  ```
  Feature "{title}" verified and ready for review (PR URL not yet available).
  ```
- **Data:** Feature title, PR URL (if available)
- **Purpose:** CPO can immediately review PR without polling

### 4. **Verification Inconclusive**
- **Trigger:** `handleJobComplete` when verification result starts with "INCONCLUSIVE"
- **Message Format:**
  ```
  Verification inconclusive for feature {featureId}: {first 200 chars of result}. Needs manual triage.
  ```
- **Purpose:** Flag features requiring human judgment

### 5. **Verification Failed (Re-queued)**
- **Trigger:** `handleVerifyResult` when `passed === false`
- **Message Format:**
  ```
  Feature "{featureTitle}" failed verification: {first 200 chars of output}. Needs triage.
  ```
- **Data:** Feature title, test output
- **Purpose:** Alert CPO that feature re-queued, needs attention

### 6. **Test Deploy Failed**
- **Trigger:** `handleJobComplete` when `job.job_type === "deploy_to_test"` and result indicates failure
- **Message Format:**
  ```
  Test deploy failed for feature {featureId}: {first 200 chars of result}
  ```
- **Purpose:** CPO aware that test environment setup failed

### 7. **Verification Failed — Retry Job Created**
- **Trigger:** `handleVerificationFailed` when catch-up detect verification failure
- **Message Format:**
  ```
  Verification failed for "{featureTitle}": {first 200 chars of result}. Returning to building with a fix job.
  ```
- **Purpose:** Explain transition and next step

### 8. **Stuck Deploy-to-Test Recovery**
- **Trigger:** `processFeatureLifecycle` (catch-up task) detecting stuck deploying_to_test
- **Message Format:**
  ```
  Feature {featureId} was stuck in deploying_to_test (no job heartbeat for >5min). Rolled back to verifying for retry.
  ```
- **Purpose:** Explain automatic recovery action

---

## Wiring Required for Manual Build

### Prerequisites
1. **Supabase:** Realtime channels enabled for `agent:*` namespace
2. **Machines:** CPO job assigned to machine (job has `machine_id`)
3. **Orchestrator:** Edge function deployed with `notifyCPO` function
4. **Local Agent:** Executor built with `handleMessageInbound` handler (v2.0+)
5. **tmux:** Available on machine where local agent runs (standard on macOS/Linux)

### Orchestrator Setup (supabase/functions/orchestrator/index.ts)

Already wired in current master. Notifications triggered automatically when:
- `handleJobComplete` processes specific job types
- `handleVerifyResult` processes verification results
- Catch-up lifecycle monitor detects stuck features

No additional configuration needed — all calls already in place.

### Local Agent Setup (packages/local-agent/src/executor.ts)

Already implemented. When executor starts:

1. Creates persistent agent workspace: `~/.zazigv2/{company_id}-{role}-workspace/`
2. Sets up `.mcp.json` with zazig-messaging MCP server reference
3. Spawns Claude Code in tmux session
4. Listens to Realtime channel `agent:{machine-name}` for `message_inbound` events
5. Queues and injects messages via tmux when received

No additional wiring needed — automatic on persistent agent startup.

### CPO Session (Local)

**No configuration needed.** When CPO starts:

1. Executor detects `role === "cpo"` in job context
2. Launches Claude Code in interactive TUI mode
3. CPO messages from orchestrator auto-inject into the terminal
4. CPO sees notifications appear in real-time during session

**Format in terminal:**
```
[Message from orchestrator, conversation:internal:notification:{uuid}]
Feature "User Auth Flow" broken into 7 jobs. 3 immediately dispatchable (no dependencies).
```

---

## Implementation Status

### Merged Features
- ✅ `notifyCPO` orchestrator function
- ✅ `MessageInbound` wire protocol
- ✅ `handleMessageInbound` executor handler
- ✅ Message queue and tmux injection
- ✅ 9+ notification triggers across pipeline
- ✅ Automated tests for `notifyCPO` (query CPO job, resolve machine, send message)

### Test Coverage
- ✅ "notifyCPO — sends MessageInbound to CPO machine" test
- ✅ "notifyCPO — no active CPO → no channel operations" test
- ✅ Integration tests verify jobs/machines queries
- ✅ Error handling tests for missing CPO/machine

### Deployed
- Feature merged to master (2026-02-24)
- Orchestrator function available in production
- Local agent supporting message injection

---

## Known Limitations

1. **Message Loss on Offline CPO:**
   - If no active CPO found, message is logged and lost
   - CPO catches up on next wakeup via regular polling
   - Solution: Dispatch a new CPO job if one is needed

2. **No Message Persistence:**
   - Notifications only reach active sessions
   - Not stored in database for later retrieval
   - Design: CPO session is always-on for a project, messages should arrive in real-time

3. **No Message Ordering Guarantees:**
   - Realtime broadcasts are fire-and-forget
   - High volume could see out-of-order delivery
   - Mitigation: Messages are informational, not critical state changes

4. **tmux Dependency:**
   - Requires tmux to be available on local agent machine
   - Fails silently if tmux not found
   - Standard on macOS/Linux, not Windows-native

5. **15-Second Startup Delay:**
   - Messages won't inject until CPO_STARTUP_DELAY_MS elapsed
   - Prevents Claude Code TUI from being interrupted during boot
   - Early messages (within 15s of start) will wait

---

## Building Manual Documentation

### Structure
1. **System Diagram:** Orchestrator → Supabase Realtime → Local Agent → tmux → Claude Code
2. **Message Protocol:** Show `MessageInbound` JSON structure and routing logic
3. **Operational Flow:** Step-by-step from orchestrator call to terminal display
4. **Notification Catalog:** List all triggers, message formats, when they occur
5. **Troubleshooting:** Missing CPO, machine_id null, tmux errors, message loss
6. **Testing:** How to verify notifications are working (logs, Realtime monitoring)

### Key Sections to Document
- **Setup checklist:** Supabase Realtime enabled, CPO job assigned to machine
- **Expected behavior:** When CPO should see notifications (breakdowns, failures, etc.)
- **Debug:** Check `jobs` table for active CPO, check `machines.name` resolution
- **Logs:** Orchestrator logs when notification sent, executor logs when injected

---

## Code References

### Orchestrator notification function
- File: `supabase/functions/orchestrator/index.ts`
- Lines: 1653-1700 (function definition)
- Callers: Lines 1191, 1250, 1269, 1299, 1316, 1343, 2608, 3023, 3137, 3154, 3284

### Local agent handler
- File: `packages/local-agent/src/executor.ts`
- `handleMessageInbound`: Message routing and queuing
- `enqueueMessage`: Queue management
- `processMessageQueue`: Sequential drain
- `injectMessage`: tmux integration
- `CPO_STARTUP_DELAY_MS = 15000`: Startup grace period

### Shared protocol
- File: `packages/shared/src/messages.ts`
- `MessageInbound` interface: Protocol definition
- Includes type guards: `isMessageInbound()`

### Tests
- File: `supabase/functions/orchestrator/orchestrator.test.ts`
- "notifyCPO — sends MessageInbound to CPO machine" (lines ~1500+)
- "notifyCPO — no active CPO → no channel operations"
- Mock utilities: createSmartMockSupabase, setResponse, chainedCalls tracking

---

## Summary

Terminal Notifications are **fully implemented and deployed**. The system is event-driven:

1. Orchestrator detects pipeline events (job complete, verification failed, etc.)
2. Calls `notifyCPO(companyId, message)` with context-specific text
3. Looks up active CPO job on that company
4. Sends `MessageInbound` via Supabase Realtime to CPO's machine
5. Local agent's executor receives message
6. Queues message and injects into tmux session
7. CPO sees formatted message in Claude Code terminal immediately

**No additional wiring needed for a manual build** — all code is in master, tests pass, and the system is operational. The manual build doc should focus on explaining the architecture, notification triggers, and how to verify correct operation.
