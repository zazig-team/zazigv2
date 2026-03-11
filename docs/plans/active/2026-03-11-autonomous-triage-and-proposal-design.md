# Autonomous Triage & Proposal — Headless Expert Sessions for Idea Processing

**Date:** 2026-03-11
**Status:** Draft
**Authors:** Tom Weaver, Claude (CPO)
**Focus Areas:** The Full Loop, Autonomous Organisation
**Related:** Background triage design (2026-03-09), Auto-triage proposal (2026-03-05), Idea hardening pipeline (2026-03-09), Expert sessions system

---

## Problem

Ideas pile up in the inbox with no scalable way to process them. The current single-idea triage button dispatches a pipeline job that consumes a `claude_code` slot — the same slots used for engineering work. Batch-triaging 19 ideas means 19 jobs competing with real feature work. The auto-triage toggle was designed but never implemented because it required too much new infrastructure.

Beyond triage, there's a deeper gap: ideas jump from "triaged with some notes" straight to "feature being broken into code jobs." Migration 111 collapsed the `created` holding state, removing the Proposal stage where features got specced before breakdown. Nothing replaced it. The result: half-baked ideas enter the pipeline and either fail or produce the wrong thing.

**What's needed:**
1. Triage that runs outside the pipeline, doesn't consume engineering slots, and can process ideas autonomously
2. A proposal/spec stage that works up ideas before they become features
3. Both stages default to autonomous, with escape hatches for founder involvement

---

## Design: Two Autonomous Expert Stages

Extend Chris's expert session system with a **headless mode** — autonomous experts that spawn, process work, write reports, and exit without human interaction. This reuses proven infrastructure (separate manager, separate DB table, no slot consumption, parallel execution) while adding autonomy.

### Architecture Overview

```
Idea (new)
  │
  ▼
┌─────────────────────────────────────────────┐
│           TRIAGE EXPERT (headless)           │
│                                             │
│  Evaluate against goals, roadmap, duplicates │
│  Set priority, tags, suggested_exec          │
│  Route to next track                         │
│                                             │
│  Outputs:                                    │
│    → direct promote (simple, clear scope)    │
│    → develop (needs spec)                    │
│    → workshop (needs founder input)          │
│    → harden (strategic/capability-level)     │
│    → auto-park (low value, not now)          │
│    → auto-reject (spam, out of scope)        │
└─────────────────────────────────────────────┘
  │
  ▼ (ideas routed to "develop")
┌─────────────────────────────────────────────┐
│           SPEC EXPERT (headless)             │
│                                             │
│  Write spec, acceptance criteria             │
│  Check codebase feasibility                  │
│  Estimate complexity                         │
│  Identify dependencies, human checklist      │
│                                             │
│  Outputs:                                    │
│    → specced (ready for promote decision)    │
│    → needs workshop (hit ambiguity)          │
│    → needs hardening (too complex for spec)  │
└─────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────┐
│         CPO / FOUNDER DECISION               │
│                                             │
│  Review spec → promote to feature            │
│  Feature enters pipeline at breaking_down    │
│  Spec, acceptance criteria already attached  │
└─────────────────────────────────────────────┘
```

---

## 1. Headless Expert Sessions

### What Changes

The existing `ExpertSessionManager` gains a `headless` mode. When `headless: true`:

- No tmux window is created (or a hidden one for Claude Code to run in)
- No TUI linking or window switching
- Expert receives its brief as a system prompt, not via SessionStart hook display
- Expert runs autonomously — no human interaction expected
- On completion: report written to DB, injected into CPO session, workspace cleaned up
- Auto-exit: session ends when Claude finishes processing (no waiting for human to quit)

### What Stays The Same

- Workspace creation, git worktree setup, CLAUDE.md generation
- Role-based prompt, skills, MCP tools, settings overrides
- DB tracking in `expert_sessions` table
- Report capture and CPO notification
- Complete isolation from pipeline slots

### Schema Changes

```sql
-- Add headless flag to expert_sessions
ALTER TABLE expert_sessions ADD COLUMN headless BOOLEAN DEFAULT false;

-- Add batch tracking
ALTER TABLE expert_sessions ADD COLUMN batch_id UUID;
ALTER TABLE expert_sessions ADD COLUMN items_processed INTEGER DEFAULT 0;
ALTER TABLE expert_sessions ADD COLUMN items_total INTEGER DEFAULT 0;
```

### Start Expert Message Extension

```typescript
interface StartExpertMessage {
  // ... existing fields
  headless?: boolean;        // Run without tmux window / human interaction
  batch_id?: string;         // Group related sessions
  auto_exit?: boolean;       // Exit when work is complete (default true for headless)
}
```

### ExpertSessionManager Changes

```typescript
// In handleStartExpert():
if (msg.headless) {
  // Skip tmux window creation — run Claude as background process
  // Or create a detached tmux session that doesn't link to viewer
  // Pipe brief directly into Claude's stdin or CLAUDE.md
  // Set auto-exit: monitor for Claude process completion
}

// In handleSessionExit():
// Same cleanup flow — read report, update DB, notify CPO, clean worktree
// For headless: also log per-item timing metrics
```

---

## 2. Triage Expert Role

### Role Definition

```sql
INSERT INTO expert_roles (name, display_name, description, model, skills, mcp_tools) VALUES (
  'triage-analyst',
  'Triage Analyst',
  'Autonomous idea triage — evaluates ideas against org goals, roadmap, and existing work. Routes ideas to the appropriate track.',
  'claude-sonnet-4-6',
  ARRAY['triage'],
  '{"allowed": ["query_ideas", "update_idea", "query_features", "query_goals", "query_focus_areas", "query_projects", "get_pipeline_snapshot"]}'
);
```

### What It Evaluates

For each idea, the triage expert:

1. **Goal alignment** — Does this idea support an active goal or focus area?
2. **Roadmap fit** — How does this relate to what's already being built or planned?
3. **Duplicate check** — Content-level comparison against features, other ideas, and parked/rejected ideas
4. **Priority signal** — Urgency, impact, cost of delay
5. **Complexity assessment** — Simple (one feature, clear scope) vs complex (multi-system, architectural)
6. **Opportunity cost** — What would we NOT build if we built this?
7. **Risk of feature destruction** — Does this conflict with or undermine existing features?

### Routing Decisions

The triage expert sets `triage_notes` with its recommendation AND a `triage_route` field:

| Route | Criteria | Next Status |
|-------|----------|-------------|
| `promote` | Simple, clear scope, goal-aligned, no ambiguity | `triaged` (ready for CPO/founder to promote) |
| `develop` | Needs spec work but direction is clear | `developing` |
| `workshop` | Ambiguous requirements, needs founder input, multiple valid approaches | `workshop` |
| `harden` | Strategic, multi-feature, capability-level, architectural change | `hardening` |
| `park` | Low value, not aligned with current goals, bad timing | `parked` (auto) |
| `reject` | Spam, out of scope, duplicate of existing work | `rejected` (auto) |
| `founder-review` | Triage expert is uncertain, needs human judgement | `triaged` + flag |

### Authority

The triage expert CAN autonomously:
- Set priority, tags, suggested_exec, domain, scope, complexity
- Auto-park low-value or poorly-timed ideas (with triage_notes explaining why)
- Auto-reject spam or clear duplicates (with triage_notes explaining why)
- Route to `developing`, `workshop`, or `hardening` status
- Flag ideas that need founder attention

The triage expert CANNOT:
- Promote ideas to features (human approval required)
- Create features or capabilities
- Modify existing features or the pipeline

---

## 3. Spec Expert Role

### Role Definition

```sql
INSERT INTO expert_roles (name, display_name, description, model, skills, mcp_tools) VALUES (
  'spec-writer',
  'Spec Writer',
  'Autonomous feature specification — writes specs, acceptance criteria, and feasibility assessments for ideas routed to development.',
  'claude-sonnet-4-6',
  ARRAY['spec-feature'],
  '{"allowed": ["query_ideas", "update_idea", "query_features", "query_goals", "query_focus_areas", "get_pipeline_snapshot"]}'
);
```

### What It Produces

For each idea in `developing` status, the spec expert:

1. **Reads triage notes** — Understands why this was routed to develop
2. **Explores the codebase** — Identifies affected files, tables, edge functions, components
3. **Writes a spec** — What to build, how it integrates, what changes where
4. **Defines acceptance criteria** — Concrete, testable conditions for "done"
5. **Identifies human checklist** — Things only a human can verify or approve
6. **Estimates complexity** — Simple / medium / complex based on blast radius
7. **Flags blockers** — Dependencies, one-way doors, things that need discussion

### Output

The spec expert writes its output back to the idea record:

```typescript
update_idea({
  idea_id: "...",
  status: "specced",       // New status: spec complete, ready for promote decision
  spec: "...",             // The full spec markdown
  acceptance_tests: "...", // Acceptance criteria
  human_checklist: "...",  // What needs founder sign-off
  complexity: "medium",
  triage_notes: "...",     // Append spec summary to existing triage notes
});
```

### Escape Hatches

During spec writing, the expert may discover the idea is more complex than triage estimated:

| Discovery | Action |
|-----------|--------|
| Multiple valid architectures, can't pick one | Route to `workshop`, note the options |
| Touches 3+ systems, needs architectural decision | Route to `hardening` via `/harden` |
| Blocked by missing dependency or infra | Route to `workshop` with blocker details |
| Turns out to be trivial | Write minimal spec, mark as `specced` |

---

## 4. Batch Execution Model

### Batch Sizing

Don't process all ideas in one session. Don't spawn one session per idea. Find the middle ground.

**Starting point:** 3-5 ideas per expert session. This balances:
- Context efficiency (one Claude session amortises startup cost)
- Risk (if a session crashes, you lose at most 5 ideas' progress)
- Parallelism (multiple sessions can run concurrently)

**For 19 new ideas:**
- 4 triage sessions of ~5 ideas each
- Run 2-3 concurrently (expert sessions don't consume pipeline slots)
- Total wall time: ~10-15 minutes instead of ~60 minutes serial

### Per-Idea Timing Metrics

Track how long each idea takes to triage and spec. Store in the expert session record.

```sql
-- New table for per-item metrics
CREATE TABLE expert_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES expert_sessions(id),
  idea_id UUID REFERENCES ideas(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  route TEXT,              -- What the triage expert decided
  model TEXT,              -- Which model processed this item
  tokens_used INTEGER      -- If available from Claude API
);
```

Over time, this data reveals:
- Average triage time per idea (by model, by complexity, by domain)
- Optimal batch size (where does per-idea time start degrading?)
- Whether parallelism helps or hurts (context switching overhead)
- Cost per triage (tokens × model pricing)

### Concurrent Sessions

Multiple expert sessions of the same role CAN run concurrently. They use:
- Separate tmux sessions (or background processes in headless mode)
- Separate workspaces (`~/.zazigv2/expert-{sessionId}/`)
- Separate git worktrees
- No shared state (each session gets its own idea batch)

The only coordination needed: don't assign the same idea to two sessions. The dispatching logic (edge function or orchestrator) must partition ideas into non-overlapping batches before spawning sessions.

### Stacking

If more ideas arrive while triage is running, they queue for the next batch. The orchestrator heartbeat checks:
1. Are there new ideas? → Yes
2. Is a triage batch already running? → Check how many sessions are active
3. Under the concurrent session cap? → Spawn another batch
4. At capacity? → Wait for current batch to finish

**Concurrent session cap:** Start with 3 concurrent triage sessions max per machine. Tune based on metrics.

---

## 5. Three Trigger Modes

All three modes use the same underlying mechanism: spawn headless triage expert session(s) with a batch of idea IDs.

### Mode 1: Manual (WebUI)

**Single idea:** Founder clicks "Triage" on a card → one headless triage expert session with one idea. This replaces the current `request-work` pipeline job approach.

**Batch:** Founder clicks "Triage All" on the inbox → dispatches batched triage sessions for all `new` ideas.

**Implementation:** WebUI calls a new edge function `start-triage-batch` which:
1. Collects idea IDs (single or all `new`)
2. Partitions into batches of N
3. Calls `start_expert_session` for each batch with `headless: true`, `role: 'triage-analyst'`
4. Returns batch_id for tracking

### Mode 2: CPO-Initiated

CPO sees untriaged inbox during standup or conversation. Instead of running the triage skill inline, CPO calls:

```
start_expert_session({
  role_name: "triage-analyst",
  headless: true,
  brief: "Triage all new ideas in the inbox. Batch: [idea_id_1, idea_id_2, ...]",
  machine_name: "...",
  project_id: "zazigv2"
})
```

CPO becomes a delegator. Gets the report back when the expert finishes.

### Mode 3: Auto (Orchestrator Toggle)

Company-level setting in the database:

```sql
ALTER TABLE companies ADD COLUMN auto_triage BOOLEAN DEFAULT false;
```

When `auto_triage = true`, the orchestrator heartbeat:
1. Checks for ideas with status `new` older than N minutes (avoid triaging something the founder just created and is still editing)
2. Checks no triage batch is already running for this company
3. Spawns headless triage expert sessions (batched)
4. Ideas flip to `triaging` immediately

**Delay:** Don't triage an idea the instant it's created. Wait 5-10 minutes in case the founder is still adding context or related ideas in a batch.

**UI:** Surface the toggle in a future Settings page. Not in the main Ideas UI — it's a system-level preference, not a per-session action.

---

## 6. Idea Status Machine

### New Statuses

Add `developing` and `specced` to the idea status constraint:

```sql
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new', 'triaging', 'triaged',
    'developing', 'specced',           -- NEW: proposal stage
    'workshop', 'hardening',
    'parked', 'rejected', 'promoted', 'done'
  ]));
```

### New Fields

```sql
-- Triage routing
ALTER TABLE ideas ADD COLUMN triage_route TEXT;
-- Values: promote, develop, workshop, harden, park, reject, founder-review

-- Spec output (written by spec expert)
ALTER TABLE ideas ADD COLUMN spec TEXT;
ALTER TABLE ideas ADD COLUMN acceptance_tests TEXT;
ALTER TABLE ideas ADD COLUMN human_checklist TEXT;
ALTER TABLE ideas ADD COLUMN complexity TEXT;  -- simple, medium, complex
```

### Transition Diagram

```
new
  → triaging (triage expert picked it up)
  → triaged (triage complete, route=promote or founder-review)
  → developing (triage complete, route=develop → spec expert picks up)
  → workshop (triage complete, route=workshop)
  → hardening (triage complete, route=harden)
  → parked (triage complete, route=park — auto)
  → rejected (triage complete, route=reject — auto)

triaged
  → promoted (founder/CPO approves promotion to feature)
  → developing (founder says "spec this first")
  → workshop (founder wants to discuss)
  → parked (founder defers)

developing
  → specced (spec expert finished)
  → workshop (spec expert hit ambiguity)
  → hardening (spec expert found it's capability-level)

specced
  → promoted (founder/CPO approves, feature created at breaking_down)
  → workshop (founder wants changes)
  → parked (founder defers)

workshop
  → developing (resolved, needs spec)
  → triaged (resolved, simple enough to promote directly)
  → hardening (resolved, it's strategic)
  → parked (founder decides not now)
```

---

## 7. Pipeline UI Changes

### Ideas Page

Add new tabs:

| Tab | Shows | Purpose |
|-----|-------|---------|
| Inbox | `new`, `triaging` | Raw ideas, being triaged |
| Triaged | `triaged` | Evaluated, awaiting promote decision |
| Developing | `developing`, `specced` | Being specced / spec complete |
| Workshop | `workshop` | Needs founder input |
| Parked | `parked` | Deferred |
| Shipped | `promoted` | Promoted to feature/capability |

### Pipeline Page — Proposal Column

The Proposal column currently shows features with status `created` or `proposal` — which are rare since migration 111. Two options:

**Option A: Show developing ideas in the Proposal column.**
Cross-reference ideas in `developing`/`specced` status into the Pipeline view. This gives visibility into the pre-pipeline funnel without the ideas being features yet. Requires a data source change (ideas table, not features table).

**Option B: Keep Proposal column for features, remove it if always empty.**
Accept that the working-up happens in the Ideas page, not the Pipeline page. Pipeline only shows features that are in active build stages.

**Recommendation:** Option A. The Proposal column exists, it should show useful data. Ideas being specced are the pre-pipeline funnel — seeing them on the Pipeline board gives the founder a full picture from "being worked up" to "shipped."

---

## 8. CPO Role Changes

### Loses

- Direct triage execution — CPO no longer runs the `/triage` skill inline
- The triage skill remains available but CPO delegates to triage experts

### Gains

- Triage delegation — CPO spawns triage expert sessions when it spots untriaged ideas
- Triage review — CPO reads triage reports, validates routing decisions
- Promotion authority — CPO recommends promotions to founder based on triage + spec output
- Spec review — CPO reads spec expert output, validates before recommending promotion

### Interaction Pattern

```
CPO standup: "19 new ideas in inbox. Spawning triage batch."
  → 4 headless triage experts process ideas
  → Reports injected into CPO session
CPO: "Triage complete. 8 routed to develop, 3 flagged for workshop,
      2 auto-parked (low priority, not goal-aligned), 6 ready to promote.
      Want me to promote the 6 straightforward ones?"
Founder: "Yes, promote those. Let's workshop the 3 flagged ones tomorrow."
```

---

## 9. Integration with Existing Systems

### Hardening Pipeline

No changes needed. When the triage expert routes an idea to `hardening`, the existing `/harden` skill and promote-to-capability flow handle it. The triage expert just sets `status = 'hardening'` and the orchestrator picks it up.

### Existing Manual Triage Button

Replace the current implementation. Instead of calling `request-work` (which creates a pipeline job), call `start-triage-batch` (which spawns a headless expert). Same UX for the founder — click button, idea shows "Analysing...", results appear. But no pipeline slot consumed.

### Workshop Flow

No changes. `workshop` status already exists. Triage and spec experts can route ideas there. CPO + founder use brainstorming skill interactively as before.

### Promote Flow

Minimal changes. When promoting a `specced` idea to a feature, the `promote-idea` edge function should copy `spec`, `acceptance_tests`, and `human_checklist` from the idea record to the feature record. The feature enters `breaking_down` already equipped with everything the breakdown specialist needs.

```typescript
// In promote-idea edge function, when promote_to === 'feature':
const feature = {
  title: idea.title,
  description: idea.description,
  spec: idea.spec,                    // From spec expert
  acceptance_tests: idea.acceptance_tests,  // From spec expert
  human_checklist: idea.human_checklist,    // From spec expert
  priority: idea.priority,
  status: 'breaking_down',
};
```

---

## 10. Company Settings

### Database

```sql
ALTER TABLE companies ADD COLUMN auto_triage BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN triage_batch_size INTEGER DEFAULT 5;
ALTER TABLE companies ADD COLUMN triage_max_concurrent INTEGER DEFAULT 3;
ALTER TABLE companies ADD COLUMN triage_delay_minutes INTEGER DEFAULT 5;
```

### Orchestrator Heartbeat Integration

When `auto_triage = true`, the orchestrator heartbeat adds a check:

```typescript
// In orchestrator heartbeat:
if (company.auto_triage) {
  const newIdeas = await getIdeasOlderThan(company.id, 'new', company.triage_delay_minutes);
  const activeSessions = await getActiveTriageSessions(company.id);

  if (newIdeas.length > 0 && activeSessions.length < company.triage_max_concurrent) {
    const batch = newIdeas.slice(0, company.triage_batch_size);
    await spawnTriageExpert(company.id, batch, { headless: true });
  }
}
```

### Future UI

A Settings page (not yet built) with:
- Auto-triage toggle (on/off)
- Batch size slider (1-10)
- Max concurrent sessions slider (1-5)
- Delay before auto-triage (minutes)

Not a priority for v1. The toggle can be set via SQL or MCP tool initially.

---

## Implementation Sequence

### Phase 1: Headless Expert Sessions
- Extend `ExpertSessionManager` with headless mode
- Add `headless`, `batch_id`, `items_processed`, `items_total` to `expert_sessions`
- Test: spawn a headless expert, verify it runs and reports back

### Phase 2: Triage Expert
- Create `triage-analyst` expert role in `expert_roles` table
- Add `triage_route` column to ideas
- Add `developing` and `specced` to idea status constraint
- Replace WebUI triage button to use headless expert instead of pipeline job
- Test: triage a single idea via headless expert

### Phase 3: Batch Triage
- Implement batch dispatching (partition ideas, spawn multiple sessions)
- Add "Triage All" button to WebUI
- Add per-item timing metrics table
- CPO delegation (spawn triage experts instead of inline triage)
- Test: batch-triage 10+ ideas

### Phase 4: Spec Expert
- Create `spec-writer` expert role
- Wire developing → specced flow
- Update promote-idea to copy spec fields from idea to feature
- Update Ideas UI with Developing/Specced tabs
- Test: end-to-end from new idea → triaged → developing → specced → promoted

### Phase 5: Auto-Triage
- Add `auto_triage` and related columns to companies table
- Orchestrator heartbeat integration
- Test: toggle on, create idea, verify auto-triage fires after delay

### Phase 6: Pipeline UI
- Proposal column shows developing/specced ideas
- Per-idea timing dashboard (optional, lower priority)

---

## Effort Estimates

| Phase | Estimate | Depends On |
|-------|----------|-----------|
| Phase 1: Headless experts | M | Expert session manager understanding |
| Phase 2: Triage expert | M | Phase 1 |
| Phase 3: Batch triage | S | Phase 2 |
| Phase 4: Spec expert | M | Phase 2 |
| Phase 5: Auto-triage | S | Phase 3 |
| Phase 6: Pipeline UI | S | Phase 4 |

Total: ~3-4 feature cycles (each phase is one pipeline feature).

---

## Open Questions

1. **Headless implementation detail:** Should headless experts run as detached tmux sessions (invisible but same infra) or as direct child processes (simpler but different code path)? Recommendation: detached tmux — minimises changes to ExpertSessionManager.

2. **Spec field on ideas table:** Currently specs live on features. Adding spec fields to ideas means some duplication when promoting. Worth it for the pre-pipeline workflow, but should the promote step move or copy the data?

3. **Triage expert model:** Starting with `claude-sonnet-4-6` for cost/speed. Should we offer a toggle for `claude-opus-4-6` for higher-quality triage on important ideas?

4. **Auto-triage for developing:** Should the orchestrator also auto-dispatch spec experts for ideas in `developing` status? Or is that always CPO/founder-initiated? Recommendation: auto for v2, manual for v1.

5. **Metrics retention:** How long to keep per-item timing data? Recommendation: 90 days, then aggregate into summary stats.
