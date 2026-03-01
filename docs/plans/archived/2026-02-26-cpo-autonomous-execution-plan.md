# CPO Autonomous Execution — Implementation Plan

**Date:** 2026-02-26
**Status:** Plan (brainstormed and validated with Tom)
**Source proposal:** `2026-02-25-cpo-autonomous-execution-proposal.md`
**Blocked by:** ~~Contractor dispatch design needs resolving~~ — Resolved. See `2026-02-26-contractor-dispatch-routing-plan.md` (v3.1).

---

## Decisions made during brainstorm

1. **Three action categories confirmed** — PROCEED (silent), INFORM & PROCEED (tell don't ask), PAUSE & ASK (genuine decisions). The 2x2 reversibility/impact matrix stands.

2. **Second opinion on every spec** — Codex minimum. Double second opinion (Codex + Gemini) for complex specs. Complexity heuristics:
   - Touches more than one existing feature's domain
   - Involves data model changes other features read from
   - Has dependencies (depends on others or others depend on it)
   - Introduces a new pattern (new table, new edge function type, new MCP tool)
   - Tagged as part of a multi-feature initiative (shared tag with 2+ features)

3. **Self-assessment inline in `/spec-feature`** — Not a separate skill. Extract later if other contexts need it.

4. **Two-tier review: sub-agent now, contractor later**
   - Simple specs: Task sub-agent (Codex, 30 seconds, works today)
   - Complex specs: Contractor via `request_work(role: 'verification-specialist')` with Codex + Gemini review in full isolation. Available once contractor dispatch is implemented (see routing plan).

5. **No bash-loop Ralph pattern** — The iterative spec improvement runs within the CPO's existing Claude Code session using the Task tool. No `--dangerously-skip-permissions`. No external loops.

6. **Action log goes to Supabase** — `agent_events` table with `event_type: 'autonomous_action'`, not a local markdown file. Queryable by any exec, survives session restarts, feeds future Web UI.

7. **Checkpoint frequency: 3** — After 3 consecutive Category 2 actions without human input, CPO provides a summary checkpoint. Start at 3, adjust based on experience.

8. **Contractor dispatch design resolved** — `commission_contractor` was removed because it created conflicting jobs alongside the pipeline. The replacement design (`request_work` via dedicated edge function + Postgres function) is documented in `2026-02-26-contractor-dispatch-routing-plan.md` (v3.1, pending CTO review). Complex-spec review uses `request_work(role: 'verification-specialist')`. No longer a blocker for any phase.

---

## Phase 1: Role prompt changes

**What:** Add "Operating Mode" section to CPO's `roles.prompt` in Supabase.

**Mechanism:** DB migration (same pattern as migration 054).

**Content:**

```markdown
## Operating Mode

You operate on a "forgiveness not permission" basis. When the next step
in a workflow is obvious and well-defined, proceed and inform the human.
Do not ask permission for routine pipeline progression.

Three categories govern your actions:
- PROCEED: Internal work (querying, drafting, self-review). Just do it.
- INFORM AND PROCEED: State changes and resource commits (setting
  ready_for_breakdown, commissioning work, promoting ideas). Tell the
  human what you are doing, do not ask.
- PAUSE AND ASK: Novel, irreversible, or high-impact decisions
  (new projects, rejecting ideas, changing roadmap priorities,
  contradicting previous human guidance). Present options, recommend,
  wait for response.

When in doubt about which category applies, default to INFORM AND PROCEED
rather than PAUSE AND ASK. The human can always interrupt.

Run self-assessment before any one-way-door action. Do not ask the human
"is this ready?" -- assess it yourself.

After every 3 consecutive autonomous actions without human input, provide
a brief checkpoint: what you've done, what you're about to do. This is
not asking permission -- it is a summary. If the human says nothing,
continue.
```

**Estimated size:** ~200 tokens added to role prompt.

---

## Phase 2: Skill changes

### `/spec-feature` — Step 6 (presenting the package)

**Current:**
> "Ask: 'Does this capture everything? Anything to add, change, or remove?'"

**New:**
> "Present the complete package (spec, ACs, human checklist) to the human. The human may comment, redirect, or say nothing. If the human provides feedback, incorporate it and re-present. If the human says nothing or confirms, proceed to self-assessment (Step 7). Do not interpret silence as 'wait' — interpret it as 'proceed.'"

### `/spec-feature` — Step 7 (ready_for_breakdown gate)

**Current:**
> "Before setting the status, confirm explicitly: 'I'm about to mark this feature as ready for breakdown...' Only set the status after the human confirms."

**New:**
> "Before setting the status, run the self-assessment checklist:
>
> **Spec completeness:**
> - Overview exists and explains what and why
> - Requirements are numbered, specific, and testable
> - Scope boundaries explicit (in-scope and out-of-scope)
> - Dependencies are concrete (table names, API endpoints, feature IDs)
>
> **Acceptance criteria:**
> - At least one per requirement
> - Feature-level (user experience), not job-level (implementation)
> - Failure cases included
> - No Gherkin
>
> **Human checklist:**
> - At least one manual verification item requiring human judgment
>
> **Self-containment test:**
> - A Breakdown Specialist reading ONLY this spec with zero conversation history could decompose it into jobs without asking questions
>
> If any item fails, fix it and re-run.
>
> When all items pass, run a second opinion via sub-agent:
> - Always: Codex review asking 'would this cause a bad breakdown?'
> - If complex (cross-cutting, data model changes, dependencies, new patterns, multi-feature initiative): also Gemini review
>
> If critical issues found, fix and re-run checklist. Max 3 iterations. If still failing after 3, pause and tell the human the requirements may need revisiting.
>
> If no critical issues: inform the human — 'Spec passes quality checks. Setting to ready_for_breakdown.' Then set the status. Do not ask for permission."

### `/plan-capability` — Step 7 (commissioning architect)

**Current:**
> "The plan is not approved until the human says it is. Ask directly: 'Here's the final plan... Are you happy for me to commission a Project Architect?'"

**New:**
> "Present the final plan summary. If the human has been actively engaged in the planning conversation and has not raised objections to the current scope, inform and proceed: 'Plan looks solid. Commissioning Project Architect to structure this into features.' If the human expressed uncertainty or the scope changed significantly in the last exchange, pause: 'The scope shifted — want to confirm the final version before I proceed?'"

---

## Phase 3: Action logging (needs pipeline work)

**What:** Log all Category 2 actions to `agent_events` table.

**Event format:**
```json
{
  "event_type": "autonomous_action",
  "payload": {
    "category": "INFORM_AND_PROCEED",
    "action": "Set feature 'Dark Mode' to ready_for_breakdown",
    "reason": "Spec passed self-assessment (8/8) and Codex second opinion (no critical issues)",
    "reversible": false,
    "feature_id": "feat-abc-123"
  }
}
```

**Depends on:** CPO having write access to `agent_events` via `execute_sql` or a dedicated MCP tool.

**Also includes:** Runaway chain detection — CPO queries last 3 `autonomous_action` events before each Category 2 action. If 3 consecutive with no human input in between, trigger checkpoint summary.

---

## Phase 4: Autonomy configuration (future, multi-company)

Per-company `autonomy_level` setting (`always_ask` / `trust_but_verify` / `full_autonomy`). Compiled into role prompt at startup. Runtime overrides via conversation ("be more autonomous", "ask me about everything").

Not needed until zazig serves multiple companies with different trust levels.

---

## Dependencies and blockers

| Item | Status | Blocks |
|---|---|---|
| Contractor dispatch design | **Resolved** — routing plan v3.1 ready for CTO review | Phase 2 complex-spec contractor path |
| `agent_events` write access for CPO | Needs MCP tool or `execute_sql` scope check | Phase 3 |
| Gemini API key | Not configured | Phase 2 double second opinion |
| Pipeline combiner fix | Chris working on it | Nothing directly, but blocks testing the full flow |

---

## What we can do now (no blockers)

- Phase 1: Role prompt migration — one SQL migration
- Phase 2: Skill file edits — `/spec-feature` Steps 6+7, `/plan-capability` Step 7
- Phase 2 (partial): Sub-agent second opinion (Codex only) — works today via Task tool

## What needs resolving first

- ~~Contractor dispatch pattern~~ — **Resolved.** `request_work` via dedicated edge function + Postgres function. See `2026-02-26-contractor-dispatch-routing-plan.md`. Pending CTO review + implementation.
- Gemini API key — needed for double second opinion on complex specs
- Action logging mechanism — `execute_sql` already covers `agent_events`, but need to confirm CPO has insert access
