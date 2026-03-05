# Terminal Notifications — Implementation Code Guide

## Orchestrator Function: notifyCPO

**File:** `supabase/functions/orchestrator/index.ts` (lines 1653-1700)

### Complete Function

```typescript
/**
 * Sends a notification message to the active CPO agent via Realtime.
 * If no CPO is active, logs a warning and returns (message lost — CPO will catch up on next wakeup).
 */
export async function notifyCPO(
  supabase: SupabaseClient,
  companyId: string,
  text: string,
): Promise<void> {
  // Find the active CPO job
  const { data: cpoJob, error: cpoErr } = await supabase
    .from("jobs")
    .select("id, machine_id")
    .eq("role", "cpo")
    .in("status", ["dispatched", "executing"])
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (cpoErr) {
    console.error(`[orchestrator] notifyCPO: failed to find CPO job for company ${companyId}:`, cpoErr.message);
    return;
  }

  if (!cpoJob || !cpoJob.machine_id) {
    console.warn(`[orchestrator] notifyCPO: no active CPO for company ${companyId} — notification lost: ${text}`);
    return;
  }

  // Get machine name for the Realtime channel
  const { data: machine, error: machErr } = await supabase
    .from("machines")
    .select("name")
    .eq("id", cpoJob.machine_id)
    .single();

  if (machErr || !machine) {
    console.error(`[orchestrator] notifyCPO: failed to fetch machine ${cpoJob.machine_id}:`, machErr?.message);
    return;
  }

  // Send MessageInbound via Realtime
  const messagePayload = {
    type: "message_inbound",
    protocolVersion: PROTOCOL_VERSION,
    conversationId: `internal:notification:${crypto.randomUUID()}`,
    from: "orchestrator",
    text,
  };

  const channel = supabase.channel(`agent:${machine.name}`);
  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "message_inbound",
          payload: messagePayload,
        });
        await channel.unsubscribe();
        resolve();
      }
    });
  });

  console.log(`[orchestrator] Notified CPO on machine ${machine.name}: ${text.slice(0, 100)}`);
}
```

### Database Queries

**Query 1: Find active CPO job**
```sql
SELECT id, machine_id 
FROM jobs 
WHERE role = 'cpo' 
  AND status IN ('dispatched', 'executing')
  AND company_id = {companyId}
LIMIT 1
```

**Query 2: Resolve machine name**
```sql
SELECT name 
FROM machines 
WHERE id = {machine_id}
```

### Message Payload Structure

```typescript
interface MessagePayload {
  type: "message_inbound";
  protocolVersion: number;  // Current protocol version
  conversationId: string;   // internal:notification:{uuid}
  from: string;             // "orchestrator"
  text: string;             // Notification message (any length)
}
```

### Error Handling Matrix

| Condition | Action |
|-----------|--------|
| CPO query fails (cpoErr) | Log error, return (no notification) |
| No active CPO (cpoJob is null) | Log warning, return (message lost) |
| CPO has no machine_id | Log warning, return (not yet assigned) |
| Machine query fails (machErr) | Log error, return (no channel) |
| Machine not found (machine is null) | Log error, return (no channel name) |
| Channel send succeeds | Log success (first 100 chars of message) |

---

## Notification Triggers in Pipeline

All calls to `notifyCPO` occur in `handleJobComplete` or related functions:

### Trigger 1: Breakdown Complete (line ~1250)

```typescript
if (jobRow?.job_type === "breakdown" && jobRow?.feature_id && jobRow?.company_id) {
  // Mark feature as building
  const { data: feat } = await supabase
    .from("features")
    .update({ status: "building" })
    .eq("id", jobRow.feature_id)
    .eq("status", "breakdown")
    .select("id")
    .single();

  console.log(`[orchestrator] Breakdown complete — feature ${jobRow.feature_id} → building`);

  // Notify CPO about breakdown completion with job stats
  const { data: featureJobs } = await supabase
    .from("jobs")
    .select("id, depends_on")
    .eq("feature_id", jobRow.feature_id)
    .eq("status", "queued")
    .neq("job_type", "breakdown");
  const totalJobs = featureJobs?.length ?? 0;
  const dispatchable = featureJobs?.filter(
    (j: { depends_on: string[] | null }) => !j.depends_on || j.depends_on.length === 0,
  ).length ?? 0;
  const { data: feat: featData } = await supabase
    .from("features")
    .select("title")
    .eq("id", jobRow.feature_id)
    .single();
  const featureTitle = featData?.title ?? jobRow.feature_id;
  await notifyCPO(
    supabase,
    jobRow.company_id,
    `Feature "${featureTitle}" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable (no dependencies).`,
  );
}
```

**Message Example:**
```
Feature "User Authentication Flow" broken into 7 jobs. 3 immediately dispatchable (no dependencies).
```

### Trigger 2: Project Created (line ~1269)

```typescript
if (jobRow?.role === "project-architect" && jobRow?.company_id) {
  // Count features created for the project
  const projCtx: { projectId?: string; projectName?: string } = (() => {
    try { return JSON.parse(jobRow.context ?? "{}"); } catch { return {}; }
  })();
  if (projCtx.projectId) {
    const { count: featureCount } = await supabase
      .from("features")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projCtx.projectId);
    const projectName = projCtx.projectName ?? projCtx.projectId;
    await notifyCPO(
      supabase,
      jobRow.company_id,
      `Project "${projectName}" created with ${featureCount ?? 0} feature outlines. Ready for your review.`,
    );
  }
}
```

**Message Example:**
```
Project "Authentication System" created with 5 feature outlines. Ready for your review.
```

### Trigger 3: Verification Passed (line ~1299)

```typescript
if (resultUpper.startsWith("PASSED")) {
  console.log(`[orchestrator] handleJobComplete: verify PASSED for feature ${jobRow.feature_id}`);
  
  const { data: feat } = await supabase
    .from("features")
    .select("title")
    .eq("id", jobRow.feature_id)
    .single();
  const featureTitle = feat?.title ?? jobRow.feature_id;
  
  const prUrl = (() => {
    try {
      const parsed = JSON.parse(result ?? "{}");
      return parsed.pr_url;
    } catch {
      return undefined;
    }
  })();

  await updateFeature(supabase, jobRow.feature_id, {
    status: "testing_ready",
    verify_context: result,
  });

  await notifyCPO(
    supabase,
    jobRow.company_id,
    prUrl
      ? `Feature "${featureTitle}" verified — PR ready for review: ${prUrl}`
      : `Feature "${featureTitle}" verified and ready for review (PR URL not yet available).`,
  );
  if (prUrl) {
    await notifyPRReady(supabase, jobRow.company_id, featureTitle, prUrl);
  }
}
```

**Message Examples:**
```
Feature "Login Page" verified — PR ready for review: https://github.com/zazig-team/zazigv2/pull/123
```
or
```
Feature "Login Page" verified and ready for review (PR URL not yet available).
```

### Trigger 4: Verification Failed (line ~1316)

```typescript
if (resultUpper.startsWith("FAILED")) {
  console.log(`[orchestrator] Verify FAILED for feature ${jobRow.feature_id} — re-queuing`);
  await notifyCPO(
    supabase,
    jobRow.company_id,
    `Feature "${featureTitle}" failed verification: ${(testOutput ?? "").slice(0, 200)}. Needs triage.`,
  );
}
```

**Message Example:**
```
Feature "Payment Processing" failed verification: Test suite failed: ReferenceError: process is undefined at...
```

### Trigger 5: Test Deploy Failed (line ~1343)

```typescript
if (jobRow?.job_type === "deploy_to_test" && jobRow?.feature_id) {
  const urlMatch = result?.match(/https?:\/\/\S+/);
  if (urlMatch) {
    // Handle deploy success...
  } else {
    // Deploy failed — no URL found
    await notifyCPO(
      supabase,
      jobRow.company_id,
      `Test deploy failed for feature ${jobRow.feature_id}: ${(result ?? "").slice(0, 200)}`,
    );
  }
}
```

**Message Example:**
```
Test deploy failed for feature abc-123-def: Docker build failed: npm install error ERESOLVE
```

---

## Local Agent: Message Reception & Injection

**File:** `packages/local-agent/src/executor.ts`

### Message Handler

```typescript
handleMessageInbound(msg: MessageInbound): void {
  if (this.persistentAgents.size === 0) {
    console.warn(`[executor] MessageInbound dropped — no persistent agents running. from=${msg.from}, conversationId=${msg.conversationId}`);
    return;
  }

  // Determine target role: explicit > sole running agent (backward compat) > warn
  const targetRole = msg.role
    ?? (this.persistentAgents.size === 1 ? this.persistentAgents.keys().next().value : undefined);

  if (!targetRole) {
    console.warn(`[executor] MessageInbound dropped — multiple persistent agents running but no role specified. from=${msg.from}, conversationId=${msg.conversationId}`);
    return;
  }

  const agent = this.persistentAgents.get(targetRole);
  if (!agent) {
    console.warn(`[executor] MessageInbound dropped — no persistent agent for role=${targetRole}. from=${msg.from}, conversationId=${msg.conversationId}`);
    return;
  }

  const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]\n${msg.text}`;
  console.log(`[executor] Queuing inbound message from ${msg.from} for role=${targetRole} session=${agent.tmuxSession}`);
  void this.enqueueMessage(formatted, agent.tmuxSession, agent.startedAt);
}
```

### Message Queue Management

```typescript
private enqueueMessage(
  message: string, 
  sessionName: string, 
  startedAt: number, 
  type: "notification" | "human" = "human"
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    enqueueWithCap(this.messageQueue, { text: message, sessionName, startedAt, type, resolve, reject }, MAX_QUEUE_SIZE);
    if (!this.processingQueue) {
      void this.processMessageQueue();
    }
  });
}

private async processMessageQueue(): Promise<void> {
  this.processingQueue = true;
  while (this.messageQueue.length > 0) {
    const item = this.messageQueue.shift()!;
    try {
      await this.injectMessage(item.text, item.sessionName, item.startedAt);
      item.resolve();
    } catch (err) {
      console.error("[executor] Failed to inject message:", err);
      item.reject(err);
    }
  }
  this.processingQueue = false;
}
```

### Message Injection (tmux Integration)

```typescript
private async injectMessage(message: string, sessionName: string, startedAt: number): Promise<void> {
  // Wait for Claude Code to finish initializing if the session just spawned
  const elapsed = Date.now() - startedAt;
  if (elapsed < CPO_STARTUP_DELAY_MS) {
    const wait = CPO_STARTUP_DELAY_MS - elapsed;
    console.log(`[executor] Session ${sessionName} is ${Math.round(elapsed / 1000)}s old — waiting ${Math.round(wait / 1000)}s for startup`);
    await sleep(wait);
  }

  // Normalise newlines — tmux send-keys treats literal \n as Enter
  const singleLine = message.replace(/\r?\n/g, " ");

  // Use -l (literal) flag so control sequences are not interpreted as keystrokes.
  // Send Enter as a separate keystroke.
  await execFileAsync("tmux", ["send-keys", "-t", sessionName, "-l", singleLine]);
  await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);

  console.log(`[executor] Injected message into session=${sessionName}`);
}
```

### Constants

```typescript
/** Delay after CPO session spawn before allowing message injection (Claude Code startup). */
const CPO_STARTUP_DELAY_MS = 15_000;

/** Max number of queued messages before dropping new ones. */
const MAX_QUEUE_SIZE = 100;
```

---

## Shared Protocol: MessageInbound

**File:** `packages/shared/src/messages.ts`

### Type Definition

```typescript
export interface MessageInbound {
  type: "message_inbound";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Opaque conversation identifier (e.g. "slack:T123:C456:1234.5678"). */
  conversationId: string;
  /** Human-readable sender (e.g. "@tom", "orchestrator"). */
  from: string;
  /** Message content. */
  text: string;
  /**
   * Target persistent agent role (e.g. "cpo", "cto").
   * When present, the local agent routes the message to the matching persistent session.
   * Omit for backward compatibility with single-role deployments — the agent falls back
   * to the sole running persistent agent automatically.
   */
  role?: string;
}
```

### Type Guard

```typescript
export function isMessageInbound(msg: unknown): msg is MessageInbound {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "message_inbound" &&
    typeof (msg as { protocolVersion?: unknown }).protocolVersion === "number" &&
    typeof (msg as { conversationId?: unknown }).conversationId === "string" &&
    typeof (msg as { from?: unknown }).from === "string" &&
    typeof (msg as { text?: unknown }).text === "string"
  );
}
```

---

## Test Coverage

**File:** `supabase/functions/orchestrator/orchestrator.test.ts`

### Test 1: notifyCPO Sends MessageInbound

```typescript
Deno.test("notifyCPO — sends MessageInbound to CPO machine", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // CPO job query: found an active CPO
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: { id: "cpo-job-1", machine_id: "machine-1" },
    error: null,
  });

  // Machine query: resolve machine name
  setResponse("machines:select.eq.single", {
    data: { name: "toms-mac" },
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await notifyCPO(client as any, "co-1", "Test notification");

  // Verify jobs query was made with role=cpo filters
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should query jobs for active CPO");
  const eqOps = jobsChains[0].operations.filter((o) => o.method === "eq");
  const roleEq = eqOps.find((o) => o.args[0] === "role" && o.args[1] === "cpo");
  assertEquals(roleEq !== undefined, true, "Should filter by role=cpo");

  // Verify machines query was made
  const machineChains = chainedCalls.filter((c) => c.table === "machines");
  assertEquals(machineChains.length, 1, "Should query machines for CPO machine name");
  assertEquals(machineChains[0].operations[0].method, "select");
});
```

### Test 2: No Active CPO

```typescript
Deno.test("notifyCPO — no active CPO → no channel operations", async () => {
  const { client, chainedCalls, setResponse } = createSmartMockSupabase();

  // CPO job query: no active CPO (maybeSingle returns null)
  setResponse("jobs:select.eq.in.eq.limit.maybeSingle", {
    data: null,
    error: null,
  });

  // deno-lint-ignore no-explicit-any
  await notifyCPO(client as any, "co-1", "Test");

  // Verify jobs query was made
  const jobsChains = chainedCalls.filter((c) => c.table === "jobs");
  assertEquals(jobsChains.length, 1, "Should query jobs for active CPO");

  // No machines query should be made
  const machineChains = chainedCalls.filter((c) => c.table === "machines");
  assertEquals(machineChains.length, 0, "Should not query machines when no CPO found");
});
```

---

## Verification Checklist

To verify the notification system is working:

### 1. Check Orchestrator Deployment

```bash
# Verify edge function contains notifyCPO
grep -n "export async function notifyCPO" supabase/functions/orchestrator/index.ts
# Should return line 1653

# Verify test passes
deno test supabase/functions/orchestrator/orchestrator.test.ts --allow-all
# Should show "notifyCPO — sends MessageInbound to CPO machine" PASSED
```

### 2. Check Local Agent Build

```bash
# Verify executor contains handleMessageInbound
grep -n "handleMessageInbound(msg: MessageInbound)" packages/local-agent/src/executor.ts
# Should find the handler

# Build and check
npm run build --workspace packages/local-agent
# Should succeed with no errors
```

### 3. Check Database Schema

```sql
-- Verify jobs table has role and machine_id columns
\d jobs
-- Should show: role text, machine_id uuid

-- Check if active CPO job exists
SELECT id, machine_id, status FROM jobs 
WHERE role = 'cpo' AND company_id = '00000000-0000-0000-0000-000000000001'
LIMIT 1;
-- Should return active job with machine_id assigned
```

### 4. Check Realtime Subscription

```bash
# In logs after CPO job dispatches:
# [executor] Queuing inbound message from orchestrator for role=cpo session=cpo-tmux

# And after notification sent:
# [orchestrator] Notified CPO on machine {machine-name}: {first 100 chars}

# If CPO is offline:
# [orchestrator] notifyCPO: no active CPO for company {id} — notification lost: {text}
```

### 5. Verify Terminal Display

Monitor CPO's Claude Code terminal — messages should appear as:

```
[Message from orchestrator, conversation:internal:notification:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
Feature "Your Feature Title" broken into 5 jobs. 2 immediately dispatchable (no dependencies).
```

---

## Debugging Guide

### No CPO Machine Found

**Symptom:** Message lost (no active CPO warning in logs)

**Check:**
```sql
SELECT id, role, status, company_id, machine_id 
FROM jobs 
WHERE role = 'cpo' 
AND status IN ('dispatched', 'executing')
LIMIT 5;
```

**Fix:** Dispatch a new CPO job if needed or assign an existing one to a machine

### Machine Name Resolution Failed

**Symptom:** notifyCPO: failed to fetch machine error

**Check:**
```sql
SELECT id, name, company_id FROM machines LIMIT 5;
```

**Fix:** Ensure machine exists and has a name; restart local agent

### Messages Not Appearing in Terminal

**Symptom:** Logs show successful notification but no terminal output

**Check:**
```bash
# 1. Verify tmux session exists
tmux list-sessions | grep cpo

# 2. Check tmux window for messages
tmux capture-pane -t cpo-tmux -p

# 3. Check executor logs for injection errors
grep "injectMessage" logs/executor.log
```

**Fix:** 
- Ensure tmux is installed and running
- Check Claude Code initialization (should take ~15 seconds)
- Verify no shell errors preventing message input

### High Message Queue Backlog

**Symptom:** Executor logs show queue size > 50

**Check:**
```bash
# Monitor queue during notification bursts
tail -f logs/executor.log | grep "Queuing inbound message"
```

**Fix:** Reduce notification volume or increase tmux response time

---

## Integration Points for Manual Build

When building a manual documentation guide, reference these key integration points:

1. **Orchestrator → Supabase:** Uses standard Supabase JS client for queries and Realtime
2. **Supabase → Local Agent:** Realtime channel subscription automatic on executor startup
3. **Local Agent → tmux:** Uses system `tmux send-keys` command (standard macOS/Linux)
4. **tmux → Claude Code:** Claude Code accepts stdin and auto-queues typed input
5. **CPO Session:** User sees formatted message in interactive terminal

All components use the shared `MessageInbound` protocol — no custom serialization needed.

