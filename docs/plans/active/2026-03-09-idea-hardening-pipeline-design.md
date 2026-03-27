# Idea Hardening Pipeline — From Raw Idea to Battle-Tested Plan

**Date:** 2026-03-09
**Status:** Draft
**Authors:** Tom Weaver, Claude
**Focus Areas:** The Full Loop, Autonomous Organisation
**Depends on:** Promote-to-Capability triage action (idea `ceed26c1`)
**Related:** Brainstorming skill, review-plan skill, second-opinion skill, gemini-subagent skill, codex-delegate skill, Exec Context Skills (`/as-cto`)

---

## Problem

Ideas that become capabilities on the roadmap need more rigour than ideas that become features. A feature is tactical — ship in days, scope is narrow. A capability is strategic — multiple features, dependency chains, architectural decisions, weeks of work. Pushing a half-baked idea into the capability roadmap creates expensive wrong turns.

Today: ideas get triaged by CPO, optionally workshopped, then promoted directly to a feature. There's no hardening pipeline — no structured process to stress-test an idea before committing it to the roadmap. The brainstorming skill exists but isn't wired into any automated flow. Second opinions happen ad-hoc when someone remembers to ask.

What's needed: a pipeline that takes a raw idea through progressive hardening — each stage adding rigour — before it can become a capability. The pipeline should run mostly in the background, surfacing the result for human approval.

---

## Design: The Hardening Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                      IDEA HARDENING PIPELINE                          │
│                                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ WORKSHOP │  │ PRIOR ART +  │  │ SECOND       │  │ REVIEW       │ │
│  │ (opt.)   │─▶│ PLAN (gen.)  │─▶│ OPINIONS     │─▶│ (gaps)       │ │
│  │          │  │              │  │              │  │              │ │
│  │ Human +  │  │ Overlap scan │  │ Tier 0: CTO  │  │ Gap scan     │ │
│  │ brainstm │  │ Impact scan  │  │ Tier 1: Codex│  │ + revise     │ │
│  │ skill    │  │ Auto-gen v1  │  │ Tier 2: Gmni │  │              │ │
│  │          │  │ + effort est │  │ → synth → v2 │  │              │ │
│  └──────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│       │                                                   │          │
│       │ interactive                              background│          │
│       ▼                                                   ▼          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      WRITE-UP & POST                            │  │
│  │  Capability created on roadmap with plan_doc reference          │  │
│  │  Commissioned to Capability Architect for decomposition         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│       ▲                                                              │
│       │ post-ship                                                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    FEEDBACK LOOP                                 │  │
│  │  After ship/fail: what did hardening get right/wrong?           │  │
│  │  Feeds back into plan template + review prompts                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Workshop (Optional, Interactive)

**Trigger:** Human or CPO decides an idea needs deep exploration before planning.

**Tool:** The `brainstorming` skill — interactive dialogue that explores intent, constraints, approaches, and trade-offs.

**When to use:**
- Idea is vague ("we need better memory")
- Idea touches multiple systems ("restructure the pipeline")
- Idea has unclear scope ("add multi-tenant support")

**When to skip:**
- Idea is already well-defined ("add `cache_ttl_minutes` column to roles table")
- Idea came from a design conversation that already explored the space
- Idea is a concrete proposal with clear scope

**Output:** Refined idea description, constraints list, and (optionally) a preferred approach. Written back to the idea's `description` field and/or a `workshop_notes` field.

**This is the only interactive stage.** Everything after runs in the background.

### Stage 2: Prior Art Check + Plan Generation (Background)

**Trigger:** Idea enters hardening (either after workshop or directly from triage).

**Action:** Three substeps — prior art check, codebase impact scan, then plan generation.

#### 2a: Prior Art Check

Before writing anything, search for overlap with existing work:

1. **Query capabilities table** — keyword/domain match against existing capability titles and descriptions
2. **Query features table** — check for in-progress or shipped features that overlap
3. **Query ideas table** — check for parked/rejected ideas that attempted similar things (learn from why they were parked)
4. **Scan `docs/plans/active/`** — check for adjacent or conflicting design docs

**Output:** Prior art summary embedded in the plan's "Relationship to Existing Work" section. If a near-duplicate is found, flag it and pause for human decision (proceed, merge with existing, or abort).

#### 2b: Codebase Impact Scan

Structured scan of what existing code, tables, edge functions, and skills would be affected:

```typescript
interface ImpactScan {
  tables: string[];         // DB tables that need migration or query changes
  edgeFunctions: string[];  // Edge functions that need modification
  skills: string[];         // Skills that need updating or new skills needed
  agentCode: string[];      // Files in packages/local-agent/ affected
  webui: string[];          // WebUI components affected
  estimatedBlastRadius: 'narrow' | 'moderate' | 'wide';
}
```

This grounds the plan in reality. Reviewers can then say "you missed that this also affects X" instead of guessing. The scan runs via `grep`/`glob` passes on the codebase keyed to the idea's domain (DB keywords → migrations, UI keywords → webui components, etc.).

#### 2c: Plan Generation

Generate a structured markdown design document.

**Plan structure** (standard template):
```markdown
# {Idea Title} — Design Plan

**Date:** {today}
**Status:** Draft (auto-generated, pending review)
**Source idea:** {idea_id}

## Problem
{Expanded from idea description — what pain does this solve?}

## Prior Art
{From 2a — what already exists that overlaps, adjacent plans, parked ideas}

## Codebase Impact
{From 2b — tables, edge functions, skills, agent code, webui affected}
{Blast radius: narrow/moderate/wide}

## Decisions
{Key choices to make, with options and trade-offs}

## Design
{Architecture, data model, integration points}

## Implementation Phases
{Sequenced work items with dependencies}
{Each phase includes effort estimate: S / M / L / XL}

## Effort Summary
| Phase | Estimate | Depends On |
|-------|----------|-----------|
{T-shirt sizes per phase — not for time prediction, but for prioritisation signal}

## Risks and Open Questions
{What could go wrong, what's unknown}

## Relationship to Existing Work
{Cross-references to adjacent plans, capabilities, features}
```

**Generated by:** CPO (or the agent running the hardening pipeline) using the idea's description, workshop notes (if any), prior art findings, and codebase impact scan.

**Output:** `docs/plans/active/YYYY-MM-DD-{idea-slug}-design.md`

### Stage 3: Second Opinions (Background)

**Trigger:** Plan v1 generated.

**Action:** Send the plan to internal exec reviewers and external models for independent review.

#### Reviewer Tier List

| Tier | Reviewer | Tool | Lens | When |
|------|----------|------|------|------|
| 0 | CTO | `/as-cto` context + commission | Engineering feasibility, architectural fit, build cost, doctrine alignment | Always for capabilities touching code/infra |
| 1 | gpt-5.3-codex | codex-delegate investigate | Implementation gaps, code-level feasibility | Always |
| 2 | Gemini | gemini-subagent | Broad review, alternative approaches, risk analysis | Always |
| 3 | Claude (second session) | second-opinion skill | General review | Fallback if external models unavailable |

#### Tier 0: Internal Exec Review (CTO)

The CTO review is qualitatively different from external model reviews. External models are generic — they review the plan as text. The CTO reviews from a position of **accumulated context**: engineering doctrines, knowledge of the codebase, awareness of what's currently in flight, and (once personality/canons ship) opinionated beliefs about how things should be built.

**How it works:**
- If CTO has a persistent session: commission a review task directly (CTO reads the plan in their workspace, writes findings to their memory + a review doc)
- If CTO is offline: load `/as-cto` context into a review session (gets CTO's doctrines, priorities, current decisions — not just a blank model)

**CTO review prompt includes:**
- The full plan document
- "Review this from an engineering perspective. Consider: architectural fit with existing systems, build cost relative to value, alignment with your engineering doctrines, feasibility given current codebase state, and whether this creates technical debt you'd have to service."

**As execs gain personality and canons**, Tier 0 becomes increasingly valuable. A CTO with a "simplicity-first" canon pushes back on over-engineered plans. A CTO with a "reliability-over-speed" doctrine flags risky shortcuts. External models can't do this — they don't have beliefs.

**Future evolution:** Other execs (CFO for cost-heavy capabilities, CMO for user-facing ones) could join Tier 0 as the exec team grows. The reviewer selection could be automatic: capability lane → relevant exec.

#### Tier 1-3: External Model Reviews

**Tiers 0, 1, and 2 all run in parallel** when available. Each external model receives:
- The full plan document
- A review prompt asking for: architectural soundness, gaps/risks, missing alternatives, implementation feasibility, severity-rated findings

**Output:** Review documents saved alongside the plan:
- `docs/plans/YYYY-MM-DD-{idea-slug}-review-cto.md`
- `docs/plans/YYYY-MM-DD-{idea-slug}-review-codex.md`
- `docs/plans/YYYY-MM-DD-{idea-slug}-review-gemini.md`

### Stage 4: Synthesis → v2 (Background)

**Trigger:** All reviews received (or timeout after 5 minutes for any reviewer that hasn't responded).

**Action:** Claude reads all reviews + the original plan, produces a synthesised v2:
1. Incorporate all critical/high findings from all reviewers
2. **Weight CTO findings higher** — CTO has codebase context and doctrines that external models lack. Where CTO contradicts an external model on engineering matters, CTO wins unless the external model presents evidence CTO didn't have.
3. Resolve conflicting recommendations (prefer consensus; where they disagree, document both perspectives and pick one with rationale)
4. Add a "Review History" section (like the exec heartbeat design) documenting what was found and resolved, including which reviewer raised each finding
5. Update the plan file in-place (same path, now v2)

**Output:** Updated plan document with review findings incorporated + review history table.

### Stage 5: Gap Review (Background)

**Trigger:** v2 plan synthesised.

**Action:** Run the `review-plan` skill against the v2 plan. Focus on:
- Dependencies that don't exist yet
- One-way doors
- Conflicts with existing plans
- Missing error/edge cases
- Opportunities to simplify

**Output:** Review report at `docs/plans/YYYY-MM-DD-{idea-slug}-review.md`. Any fixable gaps are applied to the plan (now v2.1). Unfixable gaps become open questions.

### Stage 6: Write-Up & Post (Background → Human Approval)

**Trigger:** Gap review complete.

**Action:**
1. Create capability on the roadmap (via MCP `create_capability` or direct DB insert)
2. Link the plan document as `capabilities.details` (markdown content or reference)
3. Set capability status to `draft` (not `active` — human must approve)
4. Notify human: "Capability '{title}' has been hardened and posted to the roadmap as draft. Plan: {plan_path}. Ready for your review."

**The capability requires the plan.** The `capabilities` table should enforce this:
```sql
ALTER TABLE capabilities ADD COLUMN plan_doc_path TEXT;
-- Not nullable for capabilities created via hardening pipeline
-- Nullable for legacy/manually-created capabilities
```

**Human approval gates:**
- Human reviews the plan + reviews on the roadmap page
- Human can: approve (→ `active`), request changes (→ back to workshop), or reject (→ capability deleted, idea status → `parked`)

---

## As a Standalone Skill: `/harden`

The pipeline above is the promote-to-capability flow. But the same stages work for hardening any idea — even ones that will become features, not capabilities. Package it as a skill:

```
/harden {idea_id}           — run full pipeline on an idea
/harden {idea_id} --skip-workshop  — skip interactive workshop, go straight to plan
/harden {file_path}         — run stages 3-5 on an existing design doc
```

The skill dispatches stages 2-5 as a background agent. Stage 1 (workshop) is interactive and runs in the current session.

### Skill Flow

```typescript
// Pseudocode for the /harden skill
async function harden(input: { ideaId?: string, filePath?: string, skipWorkshop?: boolean }) {
  // Stage 1: Optional workshop (interactive)
  if (!input.skipWorkshop && !input.filePath) {
    await runBrainstormingSkill(idea);
    // Human interaction happens here
    // Skill pauses until workshop complete
  }

  // Stage 2-6: Background pipeline
  const agent = spawnBackgroundAgent({
    prompt: `
      You are running the idea hardening pipeline.

      Stage 2a: Prior art check — query capabilities, features, ideas for overlap.
      Stage 2b: Codebase impact scan — grep/glob for affected tables, functions, skills.
      Stage 2c: Generate a design plan for this idea: ${ideaDescription}
      Include prior art, impact scan, and effort estimates (S/M/L/XL per phase).
      Write to docs/plans/active/YYYY-MM-DD-{slug}-design.md

      Stage 3: Get reviews from CTO (Tier 0), Codex (Tier 1), and Gemini (Tier 2) in parallel.
      CTO: commission review task or load /as-cto context.
      Codex: codex-delegate investigate. Gemini: gemini-subagent.

      Stage 4: Synthesise all findings into the plan (v2).
      Weight CTO findings higher on engineering matters.
      Incorporate all critical/high findings. Add Review History section.

      Stage 5: Run review-plan on the v2 plan. Fix addressable gaps.

      Stage 6: Notify the user with the final plan path and summary.
    `,
    runInBackground: true,
  });
}
```

### When to Use `/harden` vs Direct Promotion

| Idea Scope | Action | Why |
|-----------|--------|-----|
| Bug fix, typo, config change | Promote to feature directly | Hardening is overkill |
| Single feature, clear scope | Optional `/harden --skip-workshop` | Quick plan + reviews, no workshop needed |
| Multi-feature capability | `/harden` (full pipeline) | Strategic work needs rigour |
| Architectural change | `/harden` (mandatory workshop) | One-way doors need deep exploration |

---

## Integration with Promote-to-Capability

When CPO or human triggers `promote_to: "capability"` in the triage flow:

1. `promote-idea` edge function validates the request
2. Instead of creating a feature, it sets `idea.status = 'hardening'`
3. The daemon (or a background agent) picks up the idea and runs the hardening pipeline
4. On completion, the capability is created on the roadmap as `draft`
5. Human reviews and approves

### New idea status: `hardening`

```sql
-- Add to ideas_status_check constraint
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new','triaged','workshop','hardening','parked','rejected','promoted','done'
  ]));
```

### Updated promote-idea edge function

Add `"capability"` to `VALID_PROMOTE_TO`:

```typescript
const VALID_PROMOTE_TO = ["feature", "job", "research", "capability"] as const;
```

When `promote_to === "capability"`:
- Don't create a capability immediately (unlike feature which creates instantly)
- Set idea status to `hardening`
- The hardening pipeline runs asynchronously
- Capability is created only after the pipeline completes

---

## Reviewer Routing (Future Evolution)

The reviewer list has two categories — internal (exec) and external (model) — each with different routing logic:

```typescript
// Internal reviewers — exec agents with identity, doctrines, canons
interface InternalReviewer {
  role: string;              // "cto", "cfo", etc.
  tool: "commission" | "as-role";  // direct commission if online, /as-{role} fallback
  lens: string;              // what they focus on
  relevantLanes: string[];   // which capability lanes trigger this reviewer
  available: () => boolean;  // check if exec has a persistent session
}

const INTERNAL_REVIEWERS: InternalReviewer[] = [
  { role: "cto", tool: "commission", lens: "engineering feasibility, architecture, build cost", relevantLanes: ["infrastructure", "autonomy", "pipeline"], available: checkCtoOnline },
  // Future: CFO for cost-heavy capabilities, CMO for user-facing, etc.
];

// External reviewers — generic models, no persistent identity
interface ExternalReviewer {
  name: string;
  tool: "codex-delegate" | "gemini-subagent" | "second-opinion";
  reasoning: "low" | "medium" | "high" | "xhigh";
  available: () => boolean;
  cost: "low" | "medium" | "high";
}

const EXTERNAL_REVIEWERS: ExternalReviewer[] = [
  { name: "codex", tool: "codex-delegate", reasoning: "medium", available: checkCodexAvailable, cost: "medium" },
  { name: "gemini", tool: "gemini-subagent", reasoning: "default", available: checkGeminiAvailable, cost: "low" },
  { name: "claude-second", tool: "second-opinion", reasoning: "default", available: () => true, cost: "high" },
];

// Select reviewers: all relevant internal + top 2 available external
function selectReviewers(capabilityLane: string): { internal: InternalReviewer[], external: ExternalReviewer[] } {
  const internal = INTERNAL_REVIEWERS.filter(r => r.available() && r.relevantLanes.includes(capabilityLane));
  const external = EXTERNAL_REVIEWERS.filter(r => r.available()).slice(0, 2);
  return { internal, external };
}
```

When the model flexibility design ships, external routing can read from the `model_routing` table. Internal routing is tied to the exec team composition — as new execs spin up with personality and canons, they automatically become available as Tier 0 reviewers for their domain.

---

## Post-Hardening Feedback Loop

The pipeline improves over time by learning from outcomes. After a hardened capability ships (or fails), a lightweight retrospective captures what the pipeline got right and wrong.

### Trigger

Capability reaches `complete` or `failed` status on the roadmap.

### Feedback Captured

```markdown
# Hardening Retrospective: {Capability Title}

**Capability:** {id}
**Source idea:** {idea_id}
**Plan:** {plan_doc_path}
**Outcome:** shipped | failed | partially shipped

## What Hardening Got Right
- {Risks the plan predicted that actually materialised}
- {Phases that were correctly sequenced}
- {Effort estimates that were accurate}

## What Hardening Missed
- {Risks that weren't flagged by any reviewer}
- {Dependencies that turned out to be wrong}
- {Effort that was wildly off}

## Reviewer Accuracy
| Reviewer | Findings | Correct | Missed | False Alarm |
|----------|----------|---------|--------|-------------|
| CTO      | 4        | 3       | 1      | 0           |
| Codex    | 3        | 2       | 0      | 1           |
| Gemini   | 5        | 3       | 0      | 2           |

## Pipeline Improvements
- {Concrete changes to make to the plan template, review prompts, or pipeline stages}
```

### How Feedback Flows Back

1. **Plan template updates** — if multiple retros show the same gap (e.g., "never estimates migration effort"), add a section to the template
2. **Review prompt tuning** — if a reviewer consistently misses a class of risk, add it to their prompt. If a reviewer produces false alarms, narrow their scope
3. **Reviewer weighting** — over time, the synthesis stage can weight reviewers based on historical accuracy (but start with equal weighting, let data accumulate)
4. **Stage additions** — if retros reveal a category of failure that no stage catches (e.g., "we never check operational cost until it's too late"), consider adding a stage

**Storage:** `docs/plans/shipped/{date}-{slug}-retrospective.md` alongside the shipped plan.

**Who runs it:** CPO as part of capability completion — the same heartbeat that monitors capability progress also triggers the retro when status changes to terminal.

---

## Relationship to Existing Skills

| Skill | Relationship |
|-------|-------------|
| `brainstorming` | Stage 1 uses this skill directly for the workshop |
| `review-plan` | Stage 5 uses this skill for gap review |
| `second-opinion` | Stage 3 fallback when external models are unavailable (Tier 3) |
| `gemini-subagent` | Stage 3 external reviewer (Tier 2) |
| `codex-delegate` | Stage 3 external reviewer (Tier 1) |
| `/as-cto` | Stage 3 internal exec review (Tier 0) — loads CTO context for engineering review |
| `/as-{role}` | Future: other execs join Tier 0 as exec team grows |
| `ship` | Not involved — hardening is pre-implementation |

The hardening pipeline is an **orchestration skill** — it sequences other skills. It doesn't do the work itself; it dispatches to specialists and synthesises results.

---

## Open Questions

1. **Should hardening be mandatory for capabilities?** Current design: yes — capabilities created via promote-to-capability always go through the pipeline. Manual override: human can create a capability directly on the roadmap page (bypasses hardening). Recommendation: mandatory for promote path, optional for manual creation.

2. **Timeout for second opinions.** If Codex or Gemini is down/slow, how long do we wait? Current proposal: 5 minutes per model. If one times out, proceed with whatever reviews we have. If both timeout, skip to stage 5 (review-plan only).

3. **Who runs the background pipeline?** Options: (a) CPO as a heartbeat task, (b) a dedicated "Hardening Agent" contractor, (c) an ad-hoc background agent spawned by the daemon. Recommendation: (c) for now — spawn a background agent when idea enters `hardening` status. Graduate to (b) if hardening volume increases.

4. **Plan document format.** Should the plan template be rigid (fill-in-the-blanks) or flexible (guidelines with sections)? Recommendation: guidelines with required sections (Problem, Decisions, Design, Phases, Risks) — rigid enough for consistency, flexible enough for diverse ideas.

5. **Cost of full pipeline.** Rough estimate per hardening run: prior art scan (~5K tokens), impact scan (~3K tokens), plan generation (~12K tokens), CTO review (~20K tokens), Codex review (~25K tokens), Gemini review (~15K tokens), synthesis (~12K tokens), gap review (~15K tokens) = ~107K tokens total. At blended pricing: **~$3-7 per idea hardened**. Acceptable for capability-level decisions. The CTO review is "free" if CTO has a persistent session — it's just another task in CTO's queue.

6. **Feedback loop trigger.** Should retrospectives be automatic (triggered on capability status change) or manual? Recommendation: automatic trigger, but retrospective content is drafted by CPO and requires human review before being applied to template/prompt changes. Don't auto-mutate the pipeline without oversight.

7. **CTO review scope.** Should CTO review every capability, or only ones in engineering-adjacent lanes? Current design: always for code/infra capabilities, opt-in for others. But a CTO with strong doctrines might want to review everything. Let the CTO's heartbeat config decide — include "review hardening queue" as a heartbeat task, CTO picks up what's relevant.
