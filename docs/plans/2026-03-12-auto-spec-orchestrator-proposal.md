# Auto-Spec: Orchestrator-Driven Spec Writing with Iterative Review

**Status:** v8 — master document (design + implementation plan + E2E testing) (2026-03-12)
**Authors:** Tom Weaver, Claude, Codex
**Replaces:** `2026-03-12-auto-spec-orchestrator-proposal-review.md` (archived)

---

## 1. Problem

When the triage-analyst routes an idea to `develop`, the idea sits until a human clicks "Write Spec" or CPO manually dispatches a spec-writer session. The pipeline downstream is fully automated, but the spec step is a manual bottleneck.

Single-pass spec-writing produces first drafts, not reviewed designs. This document's own history (v1 → v7) required bouncing between CPO, Codex gap review, plan review, and verification. Spec quality is proportional to review depth. Slow down to speed up — failed features that go build → verify → fail → diagnose → retry are far more expensive than extra review passes at spec time.

## 2. Solution

Wire `autoSpecTriagedIdeas()` into the orchestrator heartbeat with an iterative review loop: spec-writer produces a draft, spec-reviewer challenges it, and the orchestrator manages revision rounds until the spec is clean or complexity warrants human workshop.

## 3. Key Design Choices

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Iterative review loop** | Complexity-proportional: simple skips review, medium gets 1 pass, complex iterates until clean. Hard cap at 5 rounds → workshop. |
| 2 | **Specs in the repo** (`docs/specs/idea-{id}-spec.md`) | Version-controlled, auditable, available to all agents. Dual-write to DB summary fields for v1 UI compatibility. |
| 3 | **Orchestrator owns status transitions** | Spec-writer no longer self-promotes to `specced`. Enables the review loop — orchestrator reads session chain and decides next step. |
| 4 | **Reviewer verdict via `route` field** | `expert_session_items.route` = `approve`/`revise`/`workshop`/`hardening`. No new columns. |
| 5 | **One idea per chain** | Session chain model requires 1:1 idea-to-batch. Architectural invariant, not tunable. |
| 6 | **State machine: develop stays at `triaged`** | Triage analyst keeps develop-routed ideas at `triaged` until auto-spec claims them → `developing` → `specced`. Mirrors the triage pattern exactly. |
| 7 | **Session chain architecture (Approach 3)** | No new statuses. All iteration lives in the session chain grouped by `batch_id`. If visibility demands more, Approach 2 (explicit statuses) is a clean upgrade path. |
| 8 | **Settings page** | Company-level automation settings on a dedicated `/settings` route, not crammed into page headers. |
| 9 | **Manual dispatch seeds a chain** | UI generates a fresh `batch_id` and passes it to `start-expert-session`. Orchestrator continues the chain after the first session completes. |
| 10 | **UI claims to `developing` for manual dispatch** | Mirrors triage's claim-to-`triaging` pattern. Reverts to `triaged` on dispatch failure. "Orchestrator owns transitions" applies to *later* transitions (developing→specced, developing→workshop). |

---

## 4. Architecture

### 4.1 Complexity-proportional rigour

| Complexity | Review depth | Sessions | Quality bar |
|-----------|-------------|----------|-------------|
| simple | No review — straight to `specced` | 1 | "Codex could build this without asking questions" |
| medium | One review pass, one revision if needed | 2-3 | "A senior engineer could build this in a day" |
| complex | Full iteration until clean | 2-5+ | "The design has been stress-tested" |

### 4.2 The session chain

```
idea: triaged → developing ──────────────────────────→ specced
                    │                                      ▲
                    ├─ session 1: spec-writer (draft)      │
                    ├─ session 2: spec-reviewer (review)   │
                    ├─ session 3: spec-writer (revision)   │
                    ├─ session 4: spec-reviewer (approve) ─┘
                    └─ (if 5 rounds: → workshop)
```

The idea has two meaningful states: `developing` (spec work in progress) and `specced` (done). All iteration detail lives in expert sessions grouped by `batch_id`. The orchestrator checks the last completed session to decide what to dispatch next.

### 4.3 State machine

Mirrors the triage pattern:
- Triage: `new` → `triaging` (in progress) → `triaged` (complete)
- Spec: `triaged` + `triage_route = 'develop'` → `developing` (in progress) → `specced` (complete)

This makes the triage analyst more consistent — currently, `develop` is the only route that jumps ahead to a processing state. After this change, every route lands at a resting state.

**Claim ownership — who sets `developing`?**

| Trigger | Who claims | Pattern |
|---------|-----------|---------|
| Auto-spec (orchestrator) | Orchestrator atomically claims `triaged` → `developing` | Mirrors auto-triage (`new` → `triaging`) |
| Manual "Write Spec" button | UI claims `triaged` → `developing` before dispatch | Mirrors manual triage button (`new` → `triaging` at Ideas.tsx:221) |
| Failure | Caller reverts to `triaged` | Mirrors triage's revert to `new` on failure |

"Orchestrator owns transitions" applies to transitions *after* the initial claim: `developing` → `specced`, `developing` → `workshop`. The initial claim is owned by whoever starts the chain.

### 4.4 Spec file convention

- Path: `docs/specs/idea-{id}-spec.md` (UUID, not title)
- Review notes: appended as `## Review (Round N)` sections in the same file
- Every revision is a git commit
- The idea row holds `spec_url` pointing to the file path
- **Dual-write for v1:** spec-writer also populates DB fields (`spec`, `acceptance_tests`, `human_checklist`) so the existing UI keeps working. DB fields hold a summary; the repo file is the source of truth.

### 4.5 Actors

**Spec-writer** (existing role, migration 147 — prompt updated):
- Writes `docs/specs/idea-{id}-spec.md`, commits to repo
- Dual-writes summary to DB fields via `update_idea`
- Sets complexity, calls `record_session_item` with `route=specced/workshop/hardening`
- Does NOT change idea status — orchestrator owns transitions
- On revision: reads existing review notes from the spec file before revising

**Spec-reviewer** (new role):
- Reads spec file from repo
- Runs gap analysis: missing integration points, wrong assumptions, state machine mismatches, untested edge cases
- Verifies claims against actual codebase
- Appends `## Review (Round N)` section to spec file, commits
- Calls `record_session_item` with `route=approve/revise/workshop/hardening`
- Model: Sonnet as base case. Cross-model (Codex) when `machine_backends` shows availability (v1+ upgrade).
- MCP tools: same as spec-writer (needs codebase access for verification)

### 4.6 Approaches considered

**Approach 1: Spec Maturity Ladder** — idea stays at `developing`, carries a `spec_maturity` field. *Pro:* explicit sub-state tracking. *Con:* new column, loop-counting logic.

**Approach 2: Spec as Pipeline Stage** — add `spec_drafting` and `spec_review` statuses. *Pro:* fully visible in UI. *Con:* two new statuses in 11-status state machine, over-engineers simple specs.

**Approach 3: Spec Session Chain (chosen)** — no new statuses, iteration in session chain. *Pro:* minimally invasive, flexible. *Con:* less visible than explicit statuses. Approach 2 is a clean upgrade path if needed.

---

## 5. One-Way Doors

| Decision | Severity | Notes |
|----------|----------|-------|
| State machine: develop stays at `triaged` | HARD TO REVERSE | Cascades across triage analyst, orchestrator, stale recovery, WebUI. Correct call. |
| Specs in repo (`docs/specs/`) | HARD TO REVERSE | Changing location means migrating existing files. Right choice. |
| Orchestrator owns status transitions | HARD TO REVERSE | All spec-writers (auto + manual) rely on orchestrator. Enables review loop. |
| One idea per chain invariant | HARD TO REVERSE | Batching requires per-idea chain identifier. Correct for v1. |
| Session chain (Approach 3) | Reversible | Can upgrade to Approach 2 later. |
| `project_id` required | Reversible | Can relax later. |
| Cooldown 120s | Reversible | Tunable constant. |

---

## 6. Dependencies

| This plan needs... | Source | Status |
|-------------------|--------|--------|
| `spec-writer` expert role | Migration 147 | Shipped |
| `autoTriageNewIdeas()` pattern | PR #260 | Shipped |
| `start-expert-session` edge function | Existing | Shipped |
| Headless expert session infrastructure | Migrations 120, 144 | Shipped |
| Triage-analyst prompt (migration 146) | Existing | Shipped — needs update |
| Triage-analyst `query_projects` MCP tool | Migration 146 | Shipped — in `mcp_tools.allowed` |
| `auto_triage` company column | Migration 135 | Shipped |
| `batch_id` on expert sessions | Migration 144 | Shipped |
| Expert session `failed` status fix | Phase 0 | NOT STARTED — prerequisite |

---

## 7. Detailed Specification

### 7.1 Triage-analyst state machine fix + project_id assignment

**Files:** New migration (e.g., `supabase/migrations/149_triage_analyst_auto_spec.sql`)

Update triage-analyst prompt:
- Develop-routed ideas stay at `status = 'triaged'` (not `developing`). `triage_route = 'develop'` still gets set.
- Set `project_id` on develop-routed ideas. `query_projects` is already in `mcp_tools.allowed`. For single-project companies, assign automatically. Multi-project: infer or leave null.

One-time data migration:
```sql
UPDATE ideas SET status = 'triaged'
WHERE status = 'developing' AND triage_route = 'develop';
```

### 7.2 Spec-reviewer expert role

**Files:** New migration (e.g., `supabase/migrations/150_spec_reviewer_expert_role.sql`)

Insert into `expert_roles`:
- `name`: `spec-reviewer`
- `model`: `claude-sonnet-4-6`
- `skills`: `[]` (no skills needed — reviewer reads and critiques)
- `mcp_tools.allowed`: same as spec-writer (`query_ideas`, `update_idea`, `record_session_item`, `query_features`, `query_goals`, `query_focus_areas`, `get_pipeline_snapshot`)
- Prompt: read spec file from repo, run gap analysis against codebase, append review section, set verdict via `record_session_item(route=approve|revise|workshop|hardening)`

### 7.3 Company settings columns

**Files:** New migration (e.g., `supabase/migrations/151_company_auto_spec_settings.sql`)

```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_spec BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS spec_max_concurrent INTEGER DEFAULT 2;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS spec_delay_minutes INTEGER DEFAULT 5;
```

No `spec_batch_size` — locked to 1 as an architectural invariant.

### 7.4 `spec_url` column + dual-write contract

**Files:**
- New migration: `ALTER TABLE ideas ADD COLUMN IF NOT EXISTS spec_url TEXT;`
- `supabase/functions/update-idea/index.ts`: add `spec_url` to allowed fields
- `packages/local-agent/src/agent-mcp-server.ts`: add `spec_url` to `update_idea` tool's allowed fields

### 7.5 Expert session `failed` status fix (prerequisite)

**Files:**
- New migration: add `'failed'` to `expert_sessions.status` CHECK constraint
- `packages/local-agent/src/expert-session-manager.ts`: lines 205, 244, 441 — writes `failed` will now succeed

### 7.6 Spec-writer prompt update

**Files:** New migration updating `expert_roles` where `name = 'spec-writer'`

Changes to prompt:
- Write spec to `docs/specs/idea-{id}-spec.md` in the repo, commit
- Dual-write summary to DB fields via `update_idea` (spec, acceptance_tests, human_checklist, complexity, spec_url)
- Do NOT call `update_idea(status=specced)` — leave idea at `developing`
- If review notes exist in the spec file, read them before revising
- Call `record_session_item` with route when done

### 7.7 Concurrency counting fix

**Files:** `supabase/functions/orchestrator/index.ts`

Update `autoTriageNewIdeas()` at ~line 2558: change `.eq("status", "running")` to `.in("status", ["requested", "running"])`. Same fix applies to the new auto-spec concurrency check.

### 7.8 `autoSpecTriagedIdeas()` with session chain logic

**Files:** `supabase/functions/orchestrator/index.ts`

~120 lines, two responsibilities:

**Claiming new ideas:**
- Query companies where `auto_spec = true`
- Cooldown: `AUTO_SPEC_COOLDOWN_MS = 120000` (2 min)
- Count active spec sessions (writers + reviewers): `status IN ('requested', 'running')`
- Fetch ideas: `status = 'triaged'` AND `triage_route = 'develop'` AND `project_id IS NOT NULL`
- Atomic claim: `triaged` → `developing` where still `triaged`
- Dispatch spec-writer with new `batch_id`
- On failure: revert status + cancel orphaned `requested` session

**Continuing existing chains:**
- Find ideas at `developing` where latest session in `batch_id` group has `status = 'completed'`
- After spec-writer: if `simple` → orchestrator sets `specced` directly. If `medium`/`complex` → dispatch spec-reviewer (same `batch_id`)
- After spec-reviewer: read `expert_session_items.route`
  - `approve` → set `specced`
  - `revise` → dispatch spec-writer again (same `batch_id`)
  - `workshop`/`hardening` → set idea status accordingly
  - Round count ≥ 5 → set `workshop`
- Round count = count of sessions in the `batch_id` group

### 7.9 `recoverStaleDevelopingIdeas()` — chain-aware

**Files:** `supabase/functions/orchestrator/index.ts`

~40 lines:
- Ideas at `developing` for >15 min with no active session (`requested` or `running`) in their batch
- If latest session completed but no next session dispatched → re-run dispatch decision logic
- If latest session stuck at `requested` >15 min → cancel and re-dispatch
- If genuinely orphaned (no sessions) → revert to `triaged`

### 7.10 Orchestrator tick loop wiring

**Files:** `supabase/functions/orchestrator/index.ts`

Add after auto-triage (step 4b):
```typescript
// Step 4c: Auto-spec with review loop
await recoverStaleDevelopingIdeas(supabase);
await autoSpecTriagedIdeas(supabase);
```

### 7.11 WebUI: Settings page

**Files:**
- `packages/webui/src/pages/Settings.tsx` (new)
- `packages/webui/src/App.tsx` (add `/settings` route)
- `packages/webui/src/components/Nav.tsx` (add Settings link)
- `packages/webui/src/lib/queries.ts` (add read/write helpers for `auto_spec`, `spec_max_concurrent`, `spec_delay_minutes`)
- `packages/webui/src/pages/Ideas.tsx` (remove hidden auto-triage toggle code)

**Automation section:**
- Auto-Triage: toggle + batch size, max concurrent, delay
- Auto-Spec: toggle + max concurrent, delay (no batch size — it's 1)
- Read/write via `companies` table

### 7.12 WebUI: Ideas page updates

**Files:**
- `packages/webui/src/pages/Ideas.tsx`
- `packages/webui/src/lib/queries.ts`

Changes:
- "Write Spec" button: `status === 'triaged' && triage_route === 'develop'`
- "Developing" section → "Spec In Progress" (filter on `status === 'developing'`)
- Split Triaged section: "Ready for Spec" (`triage_route = 'develop'`) vs "Triaged" (other routes)
- Idea detail panel: show spec session chain progress (rounds, current phase, link to spec file via `spec_url`)

### 7.13 Manual dispatch helper update

**Files:**
- `packages/webui/src/lib/queries.ts` (~line 1051)
- `packages/webui/src/pages/Ideas.tsx` (~line 238)

**`requestHeadlessSpec` changes** (`queries.ts`):
- Accept `batchId: string` parameter
- Pass `batch_id: batchId` to `start-expert-session` (already supported at `start-expert-session/index.ts:231`)
- Update prompt: remove `set status to 'specced'` instruction (orchestrator owns later transitions)

**`handleWriteSpec` changes** (`Ideas.tsx`):
- Generate `batch_id = crypto.randomUUID()` before dispatch
- Call `updateIdeaStatus(ideaId, 'developing')` before dispatch (mirrors triage at line 221)
- Pass `batchId` to `requestHeadlessSpec`
- On failure: revert `updateIdeaStatus(ideaId, 'triaged')` (mirrors triage's revert to `new` at line 231)

```typescript
// Pseudocode for handleWriteSpec after changes:
async function handleWriteSpec(): Promise<void> {
  const batchId = crypto.randomUUID();
  await updateIdeaStatus(ideaId, 'developing');  // claim
  try {
    await requestHeadlessSpec({ companyId, projectId, ideaIds: [ideaId], batchId });
  } catch (err) {
    await updateIdeaStatus(ideaId, 'triaged').catch(() => {});  // revert
    throw err;
  }
}
```

The orchestrator sees the completed session, reads its `batch_id`, and continues the chain — same logic as auto-dispatched chains.

---

## 8. What we're NOT building

- Auto-promote (specced → feature) — human reviews spec before promoting
- Auto-generate (CPO creates ideas) — Stage 3 of auto-scheduling
- Health gates — toggle on/off is sufficient for v1
- Hardening tab in WebUI — separate follow-up, Workshop tab exists
- Spec-feature skill (CPO's interactive spec tool) — separate work
- Cross-model dispatch — v1 uses same-model. Codex-as-reviewer is a dispatch upgrade

## 9. Do NOT touch

- `packages/cli/releases/zazig.mjs`
- `packages/local-agent/releases/zazig-agent.mjs`

Built release bundles. Only rebuilt when shipping via `node scripts/bundle.js`.

---

## 10. Implementation Plan

### Phase 0: Prerequisites
*No dependencies. Must complete before all other phases.*

| Step | What | Files | Acceptance |
|------|------|-------|------------|
| 0.1 | Add `failed` to expert_sessions status constraint | New migration | `ALTER TABLE expert_sessions DROP CONSTRAINT ...; ALTER TABLE expert_sessions ADD CONSTRAINT ... CHECK (status IN ('requested','running','completed','cancelled','failed'));` applied successfully |
| 0.2 | Verify local agent `failed` writes succeed | `packages/local-agent/src/expert-session-manager.ts` | Lines 205, 244, 441 — status writes no longer silently fail. No code change needed if constraint is fixed. |

### Phase 1: Migrations
*Deploy via Supabase Management API. Order matters: 1.1 before 1.4.*

| Step | What | Files | Acceptance |
|------|------|-------|------------|
| 1.1 | Triage-analyst state machine fix + project_id | New migration | Prompt updated: develop route → `status=triaged`. Data migration moves existing `developing` ideas back. `project_id` assignment logic in prompt. |
| 1.2 | Company auto_spec settings | New migration | `auto_spec`, `spec_max_concurrent`, `spec_delay_minutes` columns exist on `companies` |
| 1.3 | `spec_url` column on ideas | New migration | `spec_url TEXT` column exists on `ideas` |
| 1.4 | Spec-writer prompt update | New migration | Prompt no longer calls `update_idea(status=specced)`. Writes spec to `docs/specs/`. Dual-writes to DB. Reads review notes on revision. |
| 1.5 | Spec-reviewer expert role | New migration | `spec-reviewer` role exists in `expert_roles` with full prompt and MCP tools |

### Phase 2: Edge function + MCP tool updates
*Can run in parallel with Phase 1 migrations.*

| Step | What | Files | Acceptance |
|------|------|-------|------------|
| 2.1 | `update-idea`: accept `spec_url` | `supabase/functions/update-idea/index.ts` | `spec_url` is writable via the edge function |
| 2.2 | `update_idea` MCP tool: accept `spec_url` | `packages/local-agent/src/agent-mcp-server.ts` | `spec_url` in allowed fields list |
| 2.3 | Deploy `update-idea` edge function | CLI deploy | `supabase functions deploy update-idea --no-verify-jwt` succeeds |

### Phase 3: Orchestrator
*Depends on Phase 0 + Phase 1. This is the core logic.*

| Step | What | Files | Acceptance |
|------|------|-------|------------|
| 3.1 | Fix auto-triage concurrency counting | `supabase/functions/orchestrator/index.ts` ~line 2558 | Counts `requested` + `running`, not just `running` |
| 3.2 | Implement `autoSpecTriagedIdeas()` | `supabase/functions/orchestrator/index.ts` | Claims new ideas, dispatches spec-writer, continues chains (reviewer dispatch, verdict reading, round counting, escalation) |
| 3.3 | Implement `recoverStaleDevelopingIdeas()` | `supabase/functions/orchestrator/index.ts` | Chain-aware recovery: re-dispatches, reverts, or cancels as appropriate |
| 3.4 | Wire into tick loop | `supabase/functions/orchestrator/index.ts` | Step 4c after auto-triage |
| 3.5 | Deploy orchestrator | CLI deploy | `supabase functions deploy orchestrator --no-verify-jwt` succeeds |

### Phase 4: WebUI
*Can run in parallel with Phase 3.*

| Step | What | Files | Acceptance |
|------|------|-------|------------|
| 4.1 | Settings page | `Settings.tsx` (new), `App.tsx`, `Nav.tsx`, `queries.ts` | `/settings` route works, shows Auto-Triage + Auto-Spec toggles with settings. Reads/writes to `companies` table. |
| 4.2 | Ideas page: Write Spec button | `Ideas.tsx` | Button shows for `triaged` + `triage_route=develop`, not `developing` |
| 4.3 | Ideas page: section updates | `Ideas.tsx` | "Spec In Progress" section for `developing`. Triaged split: "Ready for Spec" vs "Triaged". |
| 4.4 | Ideas page: spec chain detail | `Ideas.tsx`, `queries.ts` | Idea detail panel shows round count, current phase, link to spec file |
| 4.5 | Ideas page: remove auto-triage toggle | `Ideas.tsx` | Hidden toggle code removed — moved to Settings |
| 4.6 | Manual dispatch helper | `queries.ts` ~line 1051 | `requestHeadlessSpec` updated for new contract |
| 4.7 | Deploy WebUI | Push to master | Vercel auto-deploys from master |

### Phase 5: E2E Testing
*Depends on all other phases deployed to staging.*

See section 11 below.

### Build sequence diagram

```
Phase 0 ──────┐
              ├──→ Phase 3 (orchestrator) ──┐
Phase 1 ──────┘                              ├──→ Phase 5 (E2E)
Phase 2 ────────→ Phase 4 (WebUI) ──────────┘
```

Phases 1+2 and 3+4 can be parallelized. Phase 5 requires everything deployed.

---

## 11. E2E Testing Plan (Playwright on zazig-staging)

**Target:** `zazigv2-webui-staging.vercel.app`
**Staging Supabase ref:** `ciksoitqfwkgnxxtkscq`
**Staging Doppler config:** `stg`

### 11.1 Setup prerequisites

Before running E2E tests:
1. All migrations applied to staging
2. Orchestrator deployed to staging
3. `update-idea` edge function deployed to staging
4. At least one machine online and registered against staging
5. `auto_triage` AND `auto_spec` enabled for the test company via Settings page or direct DB update

### 11.2 Test: Full loop — simple idea (no review)

```
Test: auto-spec-simple-idea
Goal: Simple idea goes triage → spec → specced with no review pass

Steps:
1. Navigate to staging WebUI, log in
2. Create a new idea via the Ideas inbox:
   - Title: "[E2E] Simple auto-spec test — {timestamp}"
   - Description: "Add a console.log statement to the orchestrator startup. Single file, one line change."
3. Wait for auto-triage to pick it up (poll Ideas page, max 3 min)
   - Assert: idea moves from Inbox to Triaged section
   - Assert: idea has triage_route = 'develop'
   - Assert: idea has project_id set
4. Wait for auto-spec to claim it (poll, max 3 min)
   - Assert: idea moves to "Spec In Progress" section (status = developing)
5. Wait for spec-writer session to complete (poll, max 10 min)
   - Assert: idea has spec_url set (visible in detail panel)
   - Assert: idea has complexity = 'simple'
6. Wait for orchestrator to skip review and set specced (poll, max 2 min)
   - Assert: idea moves to specced
   - Assert: no spec-reviewer session was created for this batch_id
7. Verify spec file exists in repo:
   - Assert: docs/specs/idea-{id}-spec.md exists (check via GitHub API or direct file read)
   - Assert: file contains spec content (not empty)
   - Assert: DB fields spec, acceptance_tests are populated
```

### 11.3 Test: Full loop — complex idea (with review)

```
Test: auto-spec-complex-idea-review-loop
Goal: Complex idea goes through spec → review → revision cycle

Steps:
1. Create a new idea:
   - Title: "[E2E] Complex auto-spec test — {timestamp}"
   - Description: "Build a new Settings page with company-level automation controls,
     database-backed toggles, real-time sync across tabs, and role-based access control.
     Needs new routes, components, query helpers, and migration."
2. Wait for auto-triage → triaged with triage_route = 'develop' (max 3 min)
3. Wait for auto-spec claim → developing (max 3 min)
4. Wait for spec-writer session to complete (max 10 min)
   - Assert: idea has complexity = 'medium' or 'complex'
   - Assert: spec file exists in repo
5. Wait for spec-reviewer session to be dispatched (max 3 min)
   - Assert: a spec-reviewer expert_session exists with same batch_id
6. Wait for spec-reviewer session to complete (max 10 min)
   - Assert: spec file has a "## Review (Round 1)" section
7. Check the outcome:
   - If reviewer approved (route=approve): idea should be specced. Done.
   - If reviewer requested revision (route=revise): wait for spec-writer to be re-dispatched
     - Assert: new spec-writer session with same batch_id
     - Wait for completion, then check for next reviewer dispatch
8. Verify the final spec file has all review sections appended
9. Verify idea is eventually specced (max 30 min total timeout)
```

### 11.4 Test: Settings page toggles

```
Test: settings-page-auto-spec-toggle
Goal: Auto-spec can be toggled on/off via Settings page

Steps:
1. Navigate to /settings
2. Assert: Auto-Triage section visible with toggle
3. Assert: Auto-Spec section visible with toggle
4. Toggle Auto-Spec off
5. Assert: toggle visually reflects off state
6. Refresh page → assert: toggle still off (persisted)
7. Toggle Auto-Spec on
8. Assert: toggle visually reflects on state
9. Refresh page → assert: toggle still on
10. Verify DB: companies.auto_spec matches toggle state
```

### 11.5 Test: Stale recovery

```
Test: auto-spec-stale-recovery
Goal: Stale developing idea recovers correctly

Steps:
1. Create an idea that reaches developing (auto-spec claims it)
2. Via DB: cancel the active expert session (set status=cancelled)
   - This simulates a crashed session
3. Wait for orchestrator tick (max 2 min)
   - Assert: idea reverts to triaged (stale recovery kicks in)
4. Wait for auto-spec to re-claim (max 3 min)
   - Assert: idea moves back to developing with a new batch_id
```

### 11.6 Test: Concurrency limit

```
Test: auto-spec-concurrency-limit
Goal: Only spec_max_concurrent sessions run at once

Steps:
1. Set spec_max_concurrent = 1 for the test company
2. Create 3 simple ideas rapidly
3. Wait for auto-triage to process all 3 (max 5 min)
4. Observe: only 1 idea should be at developing at any time
   - Assert: at most 1 active spec session (requested or running) at any point
5. Wait for first idea to reach specced
6. Assert: second idea moves to developing
7. Reset spec_max_concurrent to 2
```

### 11.7 Test: Write Spec button (manual dispatch)

```
Test: manual-spec-dispatch
Goal: Manual "Write Spec" button seeds a chain with batch_id, claims to developing

Steps:
1. Create an idea, wait for triage → triaged with triage_route = 'develop'
2. Navigate to idea detail
3. Assert: "Write Spec" button visible
4. Click "Write Spec"
5. Assert: idea status changes to 'developing' immediately (UI claim, before session starts)
6. Assert: expert_session created with role='spec-writer', batch_id IS NOT NULL
7. Wait for spec-writer session to complete (max 10 min)
8. Assert: spec file created at docs/specs/idea-{id}-spec.md, idea complexity set
9. Assert: orchestrator picks up completed session by batch_id and continues chain
   - simple → specced
   - medium/complex → dispatches spec-reviewer with same batch_id
```

### 11.7b Test: Write Spec failure reverts status

```
Test: manual-spec-dispatch-failure
Goal: Failed dispatch reverts idea to triaged

Steps:
1. Create an idea at triaged with triage_route = 'develop'
2. Simulate dispatch failure (e.g., invalid project_id)
3. Assert: idea status reverts to 'triaged' (not stuck at 'developing')
```

### 11.8 Test: Triaged section split

```
Test: triaged-section-visual-split
Goal: Ideas page shows separate groups for develop-routed and other triaged ideas

Steps:
1. Create two ideas:
   - Idea A: clearly development-oriented (should get triage_route = 'develop')
   - Idea B: clearly a feature request to promote (should get triage_route = 'promote')
2. Wait for both to be triaged
3. Navigate to Ideas page
4. Assert: Idea A appears in "Ready for Spec" subsection
5. Assert: Idea B appears in "Triaged" subsection (not "Ready for Spec")
```

### 11.9 Running the E2E suite

```bash
# From repo root
PLAYWRIGHT_BASE_URL=https://zazigv2-webui-staging.vercel.app \
npx playwright test tests/e2e/auto-spec/
```

Tests should be written in `tests/e2e/auto-spec/` with Playwright MCP for browser interactions. Each test should:
- Use unique timestamped idea titles to avoid collision
- Clean up test ideas after completion (set status=`rejected`)
- Have generous timeouts (orchestrator ticks every 10s, sessions take minutes)
- Log idea IDs and session IDs for debugging

### 11.10 Loop monitoring

After E2E passes, set up a `/loop` monitor on staging:

```
/loop 30m "Check staging: are any ideas stuck at developing >30 min with no active session? Are any expert sessions stuck at requested >15 min? Report anomalies."
```

This catches regressions in the auto-spec pipeline that unit tests can't reach.

---

## 12. Safety

- Toggle off by default — opt-in per company
- Atomic claim prevents duplicate dispatch
- `developing` is unambiguously "spec in progress" — clean stale recovery
- Chain-aware recovery re-dispatches on orchestrator crash, instead of reverting
- Concurrency counting includes `requested` + `running`
- Dispatch failure cleans up idea status AND orphaned sessions
- Max concurrent limit prevents slot exhaustion (writers + reviewers combined)
- Complexity-proportional review: simple skips review
- Hard cap at 5 rounds → workshop escalation
- Project selection requires `project_id` — no guessing
- Expert session `failed` status gap fixed as prerequisite
- Assumes `master` branch (matches current zazig setup)
- Human controls the promote gate (specced → feature)

---

## 13. Unit Test Cases

**Test harness status:** Vitest works (`shared` passes, `local-agent` runs with one unrelated red test). Orchestrator harness is Deno-based and currently fails at type-check. Ship v1 with manual + E2E verification; fix Deno harness separately.

When Deno harness is fixed, add:
- **Candidate selection**: only `triaged` + `triage_route = 'develop'` + `project_id IS NOT NULL`
- **Atomic claim**: concurrent ticks don't double-dispatch
- **Stale recovery**: `developing` with no active session → revert to `triaged`
- **Chain recovery**: orchestrator crash mid-chain → re-dispatches next session
- **Dispatch failure cleanup**: reverts idea AND cancels orphaned session
- **Concurrency counting**: cap respects `requested` + `running`
- **Project gating**: ideas without `project_id` are skipped
- **No machines online**: idea reverts cleanly, no orphaned session
- **Pre-existing data**: data migration handles `developing` ideas correctly
- **Startup-failed session**: stale recovery cancels wedged `requested` session
- **Simple skip**: `complexity = 'simple'` → no reviewer dispatched
- **Medium review**: spec-writer → spec-reviewer → approve → specced
- **Revision round-trip**: revise → re-dispatch writer → reviewer approves
- **Hard cap**: 5 rounds → workshop escalation
- **Batch grouping**: all sessions share `batch_id`, round count correct

---

## Appendix A: Review Summary

**Verdict:** Ready to execute. 6 rounds of review (CPO draft → Codex gap review → plan review → Codex v4 verification → brainstorming → Codex v5 verification) have addressed 21 findings across 4 review passes. One prerequisite (Phase 0: failed status fix) must complete before auto-spec ships.

**Key trade-offs:**
- Iterative review over single-pass: more tokens per complex idea, fewer failed features downstream
- Session chain over explicit statuses: simpler schema, less visible. Approach 2 is upgrade path.
- Require `project_id` over inferring: safer, less auto-eligible. Mitigated by triage analyst update.
- Settings page over Ideas toggles: more upfront work, scales better.

## Appendix B: Codex Findings (all addressed)

**v1 gap review (8 findings):** state machine mismatch, stale recovery semantics, orphaned sessions, concurrency counting, WebUI scope, escalation UI, project selection, test coverage.

**v4 verification (4 findings):** triage analyst already has `query_projects`, Vitest works (Deno is the issue), expert session `failed` status gap, `master` branch hardcoded.

**v5 verification (4 findings):** spec-writer self-promotes (prompt must change), no machine-readable verdict (use `route` field), `spec_url` not wired (add to update-idea + MCP), batch_size > 1 breaks chain (lock to 1).

## Appendix C: Version History

- **v1** — CPO draft: single-pass auto-spec mirroring auto-triage
- **v2** — State machine fix, failure handling, project gating, tests
- **v3** — Data migration, cooldown, project_id in triage analyst
- **v4** — batch_size=1, failed status gap, branch assumption
- **v5** — Iterative review loop, spec-reviewer role, specs in repo, session chain, Settings page
- **v6** — Orchestrator owns transitions, verdict via route, dual-write, batch invariant
- **v7** — Master document: combined design + review + implementation plan + E2E testing plan
- **v8** — Manual dispatch contract: UI generates batch_id, claims to developing before dispatch, reverts on failure. Explicit claim ownership table.
