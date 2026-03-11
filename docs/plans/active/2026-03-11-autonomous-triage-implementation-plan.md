# Autonomous Triage & Proposal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend expert sessions with headless mode so triage and spec-writing run autonomously outside the pipeline, consuming no engineering slots.

**Architecture:** Two new expert roles (triage-analyst, spec-writer) run as headless expert sessions — no tmux window, no human interaction, auto-exit on completion. Batch dispatching groups ideas into small batches across concurrent sessions. Three trigger modes: manual WebUI, CPO-initiated, orchestrator auto-triage.

**Tech Stack:** TypeScript (local-agent), Deno (edge functions), PostgreSQL (migrations), React (webui), Vitest (tests)

**Design doc:** `docs/plans/active/2026-03-11-autonomous-triage-and-proposal-design.md`

---

## Phase 1: Headless Expert Sessions

The foundation everything else depends on. Extend ExpertSessionManager to support autonomous expert sessions that spawn, process work, and exit without human interaction.

### Task 1.1: Add headless flag to StartExpertMessage

**Files:**
- Modify: `packages/shared/src/messages.ts:369-391`

**Step 1: Add headless and batch fields to StartExpertMessage**

```typescript
// In StartExpertMessage interface, add after existing fields:
  /** Run without interactive tmux window — expert processes brief and exits. */
  headless?: boolean;
  /** Batch ID for grouping related headless sessions. */
  batch_id?: string;
  /** Auto-exit when Claude process completes (default true for headless). */
  auto_exit?: boolean;
```

**Step 2: Commit**

```bash
git add packages/shared/src/messages.ts
git commit -m "feat: add headless, batch_id, auto_exit fields to StartExpertMessage"
```

---

### Task 1.2: DB migration — headless expert session columns

**Files:**
- Create: `supabase/migrations/144_headless_expert_sessions.sql`

**Step 1: Write migration**

```sql
-- Headless expert sessions: autonomous experts that run without human interaction
ALTER TABLE expert_sessions ADD COLUMN headless BOOLEAN DEFAULT false;
ALTER TABLE expert_sessions ADD COLUMN batch_id UUID;
ALTER TABLE expert_sessions ADD COLUMN items_processed INTEGER DEFAULT 0;
ALTER TABLE expert_sessions ADD COLUMN items_total INTEGER DEFAULT 0;

-- Per-item metrics for triage/spec timing analysis
CREATE TABLE IF NOT EXISTS expert_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES expert_sessions(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  route TEXT,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expert_session_items_session ON expert_session_items(session_id);
CREATE INDEX idx_expert_session_items_idea ON expert_session_items(idea_id);
```

**Step 2: Commit**

```bash
git add supabase/migrations/144_headless_expert_sessions.sql
git commit -m "feat: migration 144 — headless expert session columns + per-item metrics table"
```

---

### Task 1.3: ExpertSessionManager — headless spawn path

**Files:**
- Modify: `packages/local-agent/src/expert-session-manager.ts:171-411`

This is the core change. When `msg.headless === true`, spawn Claude as a background process instead of an interactive tmux session.

**Step 1: Write the failing test**

Add to `packages/local-agent/src/expert-session-manager.test.ts`:

```typescript
it("headless expert spawns detached tmux session with pipe-pane for auto-exit detection", async () => {
  const { client, updates } = makeSupabaseClient();
  const manager = new ExpertSessionManager(
    client as any,
    "test-machine",
    "00000000-0000-0000-0000-000000000001",
    "/tmp/test-zazigv2",
    {} as any,
  );

  await manager.handleStartExpert({
    type: "start_expert",
    protocolVersion: 3,
    session_id: "headless-test-0001-0000-000000000001",
    model: "claude-sonnet-4-6",
    brief: "Triage idea batch: [idea-1, idea-2]",
    headless: true,
    auto_exit: true,
    role: {
      prompt: "You are a triage analyst.",
      skills: ["triage"],
      mcp_tools: ["query_ideas", "update_idea"],
    },
  });

  // Verify tmux new-session was called
  const tmuxNewSessionCall = mockExecFileAsync.mock.calls.find(
    (call: any[]) => call[0] === "tmux" && Array.isArray(call[1]) && call[1][0] === "new-session"
  );
  expect(tmuxNewSessionCall).toBeDefined();

  // Verify no TUI linking attempted for headless sessions
  const tmuxLinkCall = mockExecFileAsync.mock.calls.find(
    (call: any[]) => call[0] === "tmux" && Array.isArray(call[1]) && call[1].includes("link-window")
  );
  expect(tmuxLinkCall).toBeUndefined();

  // Verify DB updated with headless flag
  const sessionUpdate = updates.find(u => u.table === "expert_sessions" && u.data.status === "running");
  expect(sessionUpdate).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/local-agent && npx vitest run src/expert-session-manager.test.ts --reporter=verbose
```

Expected: FAIL — handleStartExpert doesn't accept headless flag yet.

**Step 3: Implement headless spawn in ExpertSessionManager**

In `handleStartExpert` method (around line 356), add a branch before the tmux spawn:

```typescript
// After workspace setup (line ~354), before tmux spawn:

const isHeadless = (msg as any).headless === true;

if (isHeadless) {
  // Headless mode: spawn detached tmux session, no TUI linking
  // Claude processes the brief via CLAUDE.md instructions and exits
  const claudeCmd = shellEscape(["claude", "--model", msg.model, "-p", msg.brief]);
  const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;

  await execFileAsync("tmux", [
    "new-session", "-d",
    "-s", tmuxSessionName,
    "-c", effectiveWorkspaceDir,
    shellCmd,
  ]);

  // Update DB
  const { error: updateErr } = await this.supabase
    .from("expert_sessions")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (updateErr) {
    console.error(`[expert] Failed to update session ${sessionId} to running:`, updateErr);
  }

  // Store session state (same as interactive, minus viewer fields)
  const sessionState: ExpertSessionState = {
    sessionId,
    workspaceDir,
    effectiveWorkspaceDir,
    repoDir: repoDir ?? undefined,
    bareRepoDir: bareRepoDir ?? undefined,
    branch: msg.branch,
    expertBranch,
    startCommit,
    displayName,
    tmuxSession: tmuxSessionName,
  };
  this.activeSessions.set(sessionId, sessionState);

  // Start exit polling — same as interactive, tmux has-session check
  this.startExitPolling(sessionState);

  console.log(`[expert] Headless session ${sessionId} (${displayName}) started`);
  return;
}

// ... existing interactive spawn code continues below
```

Key differences from interactive mode:
- Uses `-p` flag to pass brief directly as prompt (non-interactive)
- No TUI linking (`linkWindowIntoViewer` skipped)
- No viewer window switching
- Same exit polling (tmux has-session) — detects when Claude exits

**Step 4: Run test to verify it passes**

```bash
cd packages/local-agent && npx vitest run src/expert-session-manager.test.ts --reporter=verbose
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/local-agent/src/expert-session-manager.ts packages/local-agent/src/expert-session-manager.test.ts
git commit -m "feat: headless expert session spawn — detached tmux, no TUI linking"
```

---

### Task 1.4: Edge function — accept headless flag

**Files:**
- Modify: `supabase/functions/start-expert-session/index.ts`

**Step 1: Add headless to payload and broadcast**

In the edge function, after the existing body parsing (around line 223):

```typescript
const headless = body.headless === true;
const batchId = toTrimmedString(body.batch_id) || null;
```

In the DB insert (around line 314), add the new columns:

```typescript
const { data: sessionData, error: sessionErr } = await supabase
  .from("expert_sessions")
  .insert({
    company_id: companyId,
    expert_role_id: role.id,
    machine_id: machine.id,
    triggered_by: "cpo",
    brief,
    status: "requested",
    headless,           // NEW
    batch_id: batchId,  // NEW
  })
  .select("id")
  .single();
```

In the broadcast payload (StartExpertPayload), add:

```typescript
headless,
batch_id: batchId,
auto_exit: headless,  // Auto-exit defaults true for headless
```

**Step 2: Commit**

```bash
git add supabase/functions/start-expert-session/index.ts
git commit -m "feat: start-expert-session edge function accepts headless and batch_id"
```

---

### Task 1.5: MCP tool — add headless parameter

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts:1120-1161`

**Step 1: Add headless and batch_id to tool schema**

```typescript
server.tool(
  "start_expert_session",
  "Trigger an expert agent session. Use headless=true for autonomous background work (triage, spec writing).",
  {
    role_name: z.string().describe("The expert role identifier"),
    brief: z.string().describe("Task handoff context for the expert"),
    machine_name: z.string().describe("Which machine to spawn the expert on"),
    project_id: z.string().describe("Project ID or name — required"),
    headless: z.boolean().optional().describe("Run without interactive tmux window — expert processes brief and exits automatically"),
    batch_id: z.string().optional().describe("Batch UUID for grouping related headless sessions"),
  },
  guardedHandler("start_expert_session", async ({ role_name, brief, machine_name, project_id, headless, batch_id }) => {
    // ... existing code, add headless and batch_id to body:
    body: JSON.stringify({ role_name, brief, machine_name, project_id, headless, batch_id }),
  }),
);
```

**Step 2: Commit**

```bash
git add packages/local-agent/src/agent-mcp-server.ts
git commit -m "feat: start_expert_session MCP tool accepts headless and batch_id params"
```

---

### Task 1.6: Integration test — headless expert end-to-end

**Files:**
- Modify: `packages/local-agent/src/expert-session-manager.test.ts`

**Step 1: Write end-to-end headless test**

```typescript
it("headless expert completes full lifecycle: spawn → process → report → cleanup", async () => {
  const { client, updates } = makeSupabaseClient();
  const manager = new ExpertSessionManager(
    client as any,
    "test-machine",
    "00000000-0000-0000-0000-000000000001",
    "/tmp/test-zazigv2",
    {} as any,
  );

  // Mock: tmux new-session succeeds
  mockExecFileAsync.mockResolvedValueOnce(undefined);

  await manager.handleStartExpert({
    type: "start_expert",
    protocolVersion: 3,
    session_id: "headless-e2e-0001-0000-000000000001",
    model: "claude-sonnet-4-6",
    brief: "Test brief",
    headless: true,
    role: { prompt: "Test role" },
  });

  // Verify session stored
  expect((manager as any).activeSessions.has("headless-e2e-0001-0000-000000000001")).toBe(true);

  // Simulate tmux session dying (Claude finished)
  mockExecFileAsync.mockRejectedValueOnce(new Error("no session"));

  // Advance timer to trigger exit poll
  await vi.advanceTimersByTimeAsync(10_000);

  // Verify cleanup happened
  const completedUpdate = updates.find(u =>
    u.table === "expert_sessions" && u.data.status === "completed"
  );
  expect(completedUpdate).toBeDefined();
});
```

**Step 2: Run full test suite**

```bash
cd packages/local-agent && npx vitest run src/expert-session-manager.test.ts --reporter=verbose
```

**Step 3: Commit**

```bash
git add packages/local-agent/src/expert-session-manager.test.ts
git commit -m "test: headless expert end-to-end lifecycle test"
```

---

## Phase 2: Triage Expert Role + Idea Status Extensions

### Task 2.1: DB migration — new idea statuses and columns

**Files:**
- Create: `supabase/migrations/145_triage_and_proposal_statuses.sql`

```sql
-- Extend idea status machine with developing and specced stages
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new', 'triaging', 'triaged',
    'developing', 'specced',
    'workshop', 'hardening',
    'parked', 'rejected', 'promoted', 'done'
  ]));

-- Triage routing: what track the triage expert recommends
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS triage_route TEXT;
COMMENT ON COLUMN ideas.triage_route IS 'Triage routing decision: promote, develop, workshop, harden, park, reject, founder-review';

-- Spec output: written by spec expert during developing stage
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS acceptance_tests TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS human_checklist TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS complexity TEXT;
COMMENT ON COLUMN ideas.complexity IS 'Estimated complexity: simple, medium, complex';
```

**Commit:**

```bash
git add supabase/migrations/145_triage_and_proposal_statuses.sql
git commit -m "feat: migration 145 — developing/specced statuses + spec fields on ideas"
```

---

### Task 2.2: Create triage-analyst expert role

**Files:**
- Create: `supabase/migrations/146_triage_analyst_expert_role.sql`

```sql
-- Triage analyst as an expert role (runs outside pipeline, no slot consumption)
INSERT INTO expert_roles (name, display_name, description, model, skills, mcp_tools)
VALUES (
  'triage-analyst',
  'Triage Analyst',
  'Autonomous idea triage — evaluates ideas against org goals, roadmap, and existing work. Routes ideas to the appropriate track: promote, develop, workshop, harden, park, or reject.',
  'claude-sonnet-4-6',
  ARRAY['triage'],
  '{"allowed": ["query_ideas", "update_idea", "query_features", "query_goals", "query_focus_areas", "query_projects", "get_pipeline_snapshot"]}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  mcp_tools = EXCLUDED.mcp_tools;
```

**Commit:**

```bash
git add supabase/migrations/146_triage_analyst_expert_role.sql
git commit -m "feat: migration 146 — triage-analyst expert role for headless triage"
```

---

### Task 2.3: WebUI — replace triage button to use headless expert

**Files:**
- Modify: `packages/webui/src/pages/Ideas.tsx:208-227`
- Modify: `packages/webui/src/lib/queries.ts:1021-1032`

Replace `requestTriageJob` (which calls `request-work` and creates a pipeline job) with a new function that calls `start-expert-session` with `headless: true`.

**Step 1: Add new query function**

In `queries.ts`, add:

```typescript
export async function requestHeadlessTriage(params: {
  companyId: string;
  projectId: string;
  ideaIds: string[];
  machineName?: string;
}): Promise<{ session_id?: string }> {
  return invokePost<{ session_id?: string }>("start-expert-session", {
    role_name: "triage-analyst",
    brief: `Triage these ideas: ${JSON.stringify(params.ideaIds)}. For each idea, evaluate against org goals, check for duplicates, set priority, and route to the appropriate track (promote/develop/workshop/harden/park/reject). Call update_idea for each with your triage_notes and triage_route.`,
    machine_name: params.machineName || "auto",
    project_id: params.projectId,
    headless: true,
  });
}
```

**Step 2: Update Ideas.tsx triage handler**

Replace `handleBackgroundTriage` to call the new function:

```typescript
const handleBackgroundTriage = async (ideaId: string) => {
  if (!companyId || !defaultProjectId) return;
  setTriagingIds(prev => new Set(prev).add(ideaId));
  try {
    await updateIdeaStatus(ideaId, "triaging");
    await requestHeadlessTriage({
      companyId,
      projectId: defaultProjectId,
      ideaIds: [ideaId],
    });
  } catch (err) {
    console.error("Triage dispatch failed:", err);
    await updateIdeaStatus(ideaId, "new"); // Revert on failure
  }
};
```

**Step 3: Commit**

```bash
git add packages/webui/src/pages/Ideas.tsx packages/webui/src/lib/queries.ts
git commit -m "feat: WebUI triage button uses headless expert instead of pipeline job"
```

---

### Task 2.4: Add "Triage All" button

**Files:**
- Modify: `packages/webui/src/pages/Ideas.tsx`

**Step 1: Add Triage All button to inbox tab header**

Near the tab buttons area, add a "Triage All" button that dispatches all `new` ideas in batches:

```typescript
const handleTriageAll = async () => {
  if (!companyId || !defaultProjectId) return;
  const newIdeas = ideas.filter(i => i.status === "new");
  if (newIdeas.length === 0) return;

  setTriageAllLoading(true);
  try {
    // Batch into groups of 5
    const batchSize = 5;
    const batches: string[][] = [];
    for (let i = 0; i < newIdeas.length; i += batchSize) {
      batches.push(newIdeas.slice(i, i + batchSize).map(i => i.id));
    }

    // Mark all as triaging
    for (const idea of newIdeas) {
      await updateIdeaStatus(idea.id, "triaging");
    }

    // Dispatch batches (up to 3 concurrent)
    const concurrent = Math.min(batches.length, 3);
    for (let i = 0; i < concurrent; i++) {
      await requestHeadlessTriage({
        companyId,
        projectId: defaultProjectId,
        ideaIds: batches[i],
      });
    }
    // Remaining batches will be picked up by orchestrator or next manual dispatch
  } catch (err) {
    console.error("Triage All failed:", err);
  } finally {
    setTriageAllLoading(false);
  }
};
```

Add the button in the JSX near the inbox tab:

```tsx
{activeTab === "inbox" && newIdeas.length > 0 && (
  <button
    onClick={handleTriageAll}
    disabled={triageAllLoading}
    className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
  >
    {triageAllLoading ? "Dispatching..." : `Triage All (${newIdeas.length})`}
  </button>
)}
```

**Step 2: Commit**

```bash
git add packages/webui/src/pages/Ideas.tsx
git commit -m "feat: Triage All button dispatches batched headless expert sessions"
```

---

### Task 2.5: WebUI — add Developing tab

**Files:**
- Modify: `packages/webui/src/pages/Ideas.tsx`

**Step 1: Extend tab type and filtering**

Update the `SectionTab` type:

```typescript
type SectionTab = "inbox" | "triaged" | "developing" | "workshop" | "parked" | "rejected" | "shipped";
```

Add filter case:

```typescript
case "developing":
  return ideas.filter(i => i.status === "developing" || i.status === "specced");
```

Add STATUS_LABELS:

```typescript
developing: "Developing",
specced: "Specced",
```

Add tab button in the JSX tab bar.

**Step 2: Commit**

```bash
git add packages/webui/src/pages/Ideas.tsx
git commit -m "feat: Ideas page — Developing tab shows developing/specced ideas"
```

---

## Phase 3: Spec Expert Role

### Task 3.1: Create spec-writer expert role

**Files:**
- Create: `supabase/migrations/147_spec_writer_expert_role.sql`

```sql
INSERT INTO expert_roles (name, display_name, description, model, skills, mcp_tools)
VALUES (
  'spec-writer',
  'Spec Writer',
  'Autonomous feature specification — writes specs, acceptance criteria, and feasibility assessments for ideas routed to development. Reads triage notes, explores codebase, produces ready-to-build spec.',
  'claude-sonnet-4-6',
  ARRAY['spec-feature'],
  '{"allowed": ["query_ideas", "update_idea", "query_features", "query_goals", "query_focus_areas", "get_pipeline_snapshot"]}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  mcp_tools = EXCLUDED.mcp_tools;
```

**Commit:**

```bash
git add supabase/migrations/147_spec_writer_expert_role.sql
git commit -m "feat: migration 147 — spec-writer expert role for autonomous spec writing"
```

---

### Task 3.2: Update promote-idea to copy spec fields

**Files:**
- Modify: `supabase/functions/promote-idea/index.ts:118-139`

When promoting a specced idea to a feature, copy the spec fields:

```typescript
// In the feature promotion block (around line 118):
if (promoteTo === "feature") {
  const { data: feature, error: featureErr } = await supabase
    .from("features")
    .insert({
      company_id: idea.company_id,
      project_id: projectId,
      title: title || idea.title || idea.raw_text.slice(0, 100),
      description: idea.description || idea.raw_text,
      spec: idea.spec || null,                           // NEW — from spec expert
      acceptance_tests: idea.acceptance_tests || null,    // NEW
      human_checklist: idea.human_checklist || null,      // NEW
      priority: idea.priority || "medium",
      status: "breaking_down",
      source_idea_id: idea.id,
    })
    .select("id")
    .single();
```

**Commit:**

```bash
git add supabase/functions/promote-idea/index.ts
git commit -m "feat: promote-idea copies spec, acceptance_tests, human_checklist from idea to feature"
```

---

### Task 3.3: WebUI — spec dispatch from Developing tab

**Files:**
- Modify: `packages/webui/src/pages/Ideas.tsx`
- Modify: `packages/webui/src/lib/queries.ts`

Add a "Write Spec" button on developing ideas that dispatches a headless spec-writer expert.

In `queries.ts`:

```typescript
export async function requestHeadlessSpec(params: {
  companyId: string;
  projectId: string;
  ideaIds: string[];
}): Promise<{ session_id?: string }> {
  return invokePost<{ session_id?: string }>("start-expert-session", {
    role_name: "spec-writer",
    brief: `Write specs for these ideas: ${JSON.stringify(params.ideaIds)}. For each idea, read the triage notes, explore the codebase for affected files, write a spec with acceptance criteria and human checklist, estimate complexity, then call update_idea with spec, acceptance_tests, human_checklist, complexity, and set status to 'specced'.`,
    machine_name: "auto",
    project_id: params.projectId,
    headless: true,
  });
}
```

**Commit:**

```bash
git add packages/webui/src/pages/Ideas.tsx packages/webui/src/lib/queries.ts
git commit -m "feat: Write Spec button dispatches headless spec-writer expert"
```

---

## Phase 4: Auto-Triage via Orchestrator

### Task 4.1: Update orchestrator autoTriageNewIdeas to use headless experts

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts:2791-2879`

The existing `autoTriageNewIdeas` function dispatches pipeline jobs via `request_standalone_work`. Replace with headless expert session dispatch.

```typescript
async function autoTriageNewIdeas(supabase: SupabaseClient): Promise<void> {
  // Query companies with auto_triage enabled
  const { data: companies } = await supabase
    .from("companies")
    .select("id, auto_triage, triage_batch_size, triage_max_concurrent, triage_delay_minutes")
    .eq("auto_triage", true)
    .eq("status", "active");

  if (!companies?.length) return;

  for (const company of companies) {
    const companyId = company.id;
    const lastRun = autoTriageLastRun.get(companyId) ?? 0;
    if (Date.now() - lastRun < AUTO_TRIAGE_COOLDOWN_MS) continue;

    // Check for active headless triage sessions (not pipeline jobs)
    const { count: activeSessions } = await supabase
      .from("expert_sessions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("headless", true)
      .eq("status", "running");

    const maxConcurrent = company.triage_max_concurrent ?? 3;
    if ((activeSessions ?? 0) >= maxConcurrent) continue;

    // Get new ideas older than delay threshold
    const delayMinutes = company.triage_delay_minutes ?? 5;
    const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000).toISOString();
    const batchSize = company.triage_batch_size ?? 5;

    const { data: newIdeas } = await supabase
      .from("ideas")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "new")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (!newIdeas?.length) continue;

    // Mark as triaging
    const ideaIds = newIdeas.map(i => i.id);
    await supabase
      .from("ideas")
      .update({ status: "triaging" })
      .in("id", ideaIds);

    // Dispatch headless triage expert via edge function
    // (The orchestrator calls the start-expert-session edge function internally)
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/start-expert-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        role_name: "triage-analyst",
        brief: `Auto-triage batch. Triage these ideas: ${JSON.stringify(ideaIds)}`,
        machine_name: "auto",  // Route to any available machine
        project_id: "zazigv2",  // Default project
        headless: true,
      }),
    });

    autoTriageLastRun.set(companyId, Date.now());
  }
}
```

**Commit:**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat: orchestrator auto-triage dispatches headless expert sessions instead of pipeline jobs"
```

---

### Task 4.2: Add company triage settings columns

**Files:**
- Create: `supabase/migrations/148_company_triage_settings.sql`

```sql
-- Company-level triage configuration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_batch_size INTEGER DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_max_concurrent INTEGER DEFAULT 3;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS triage_delay_minutes INTEGER DEFAULT 5;

COMMENT ON COLUMN companies.auto_triage IS 'When true, orchestrator auto-dispatches headless triage experts for new ideas';
COMMENT ON COLUMN companies.triage_batch_size IS 'Max ideas per headless triage session (default 5)';
COMMENT ON COLUMN companies.triage_max_concurrent IS 'Max concurrent headless triage sessions per company (default 3)';
COMMENT ON COLUMN companies.triage_delay_minutes IS 'Wait N minutes after idea creation before auto-triaging (default 5)';
```

**Commit:**

```bash
git add supabase/migrations/148_company_triage_settings.sql
git commit -m "feat: migration 148 — company triage settings (batch size, concurrency, delay)"
```

---

## Phase 5: Pipeline UI — Proposal Column

### Task 5.1: Pipeline page shows developing ideas in Proposal column

**Files:**
- Modify: `packages/webui/src/hooks/usePipelineSnapshot.ts`
- Modify: `packages/webui/src/pages/Pipeline.tsx`

The Proposal column currently maps to feature statuses `created`/`proposal` which are rarely used. Cross-reference ideas in `developing`/`specced` status into this column.

This requires the Pipeline page to fetch from two data sources: features (existing) AND ideas in developing/specced status (new).

**Step 1: Add ideas query to pipeline data**

In `usePipelineSnapshot.ts`, add a parallel query for developing ideas:

```typescript
// Alongside the existing feature snapshot query:
const { data: developingIdeas } = await supabase
  .from("ideas")
  .select("id, title, status, priority, created_at, updated_at, triage_route, complexity")
  .eq("company_id", companyId)
  .in("status", ["developing", "specced"]);
```

Map these into the Proposal column data structure so Pipeline.tsx can render them.

**Step 2: Commit**

```bash
git add packages/webui/src/hooks/usePipelineSnapshot.ts packages/webui/src/pages/Pipeline.tsx
git commit -m "feat: Pipeline Proposal column shows developing/specced ideas from inbox"
```

---

## Phase 6: Remove Triage from Pipeline Slot Consumption

### Task 6.1: Remove triage-analyst from request_standalone_work

**Files:**
- Create: `supabase/migrations/149_remove_triage_from_pipeline.sql`

Since triage now runs via headless expert sessions, remove `triage-analyst` from the pipeline's allowed roles in `request_standalone_work`:

```sql
-- Triage-analyst now runs as headless expert, not pipeline job
-- Remove from request_standalone_work allowed roles
CREATE OR REPLACE FUNCTION public.request_standalone_work(
  p_company_id uuid,
  p_project_id uuid,
  p_feature_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_context text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- ... existing function body with triage-analyst removed from allowed roles list
-- Change line: IF p_role NOT IN ('pipeline-technician', 'monitoring-agent', 'verification-specialist', 'project-architect') THEN
-- (triage-analyst removed)
$$;
```

Also remove `triage-analyst` from `NO_CODE_CONTEXT_ROLES` in the orchestrator if no pipeline triage jobs remain.

**Commit:**

```bash
git add supabase/migrations/149_remove_triage_from_pipeline.sql
git commit -m "feat: migration 149 — remove triage-analyst from pipeline job dispatch (now headless expert)"
```

---

## Implementation Sequence Summary

| Phase | Feature | Depends On | Estimate |
|-------|---------|-----------|----------|
| 1 | Headless expert sessions | — | M |
| 2 | Triage expert + status extensions + WebUI | Phase 1 | M |
| 3 | Spec expert + promote integration | Phase 2 | M |
| 4 | Auto-triage orchestrator | Phase 1 + 2 | S |
| 5 | Pipeline UI — Proposal column | Phase 2 | S |
| 6 | Remove triage from pipeline slots | Phase 2 | S |

**Critical path:** Phase 1 → Phase 2 → Phase 3 (serial, each builds on previous)
**Parallel after Phase 2:** Phases 4, 5, 6 can run concurrently once Phase 2 is done.
