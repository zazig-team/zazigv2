# Workshop Tag: Wiring `needs-workshop` Into the CPO

**Date:** 2026-03-01
**Status:** Proposal
**Idea:** f382cc05-2fa9-4330-b8f1-6ecfdd55d36b

---

## Problem

**Today:** When the CPO promotes an idea to a feature, it lands in `created` status and looks identical whether it needs a 5-minute spec or 5 rounds of collaborative design iteration. The spec-feature skill assumes every feature can go from outline to full spec in a single conversation. Complex features (exec-knowledge-architecture needed 5 iterations, Getting a Grip needed 4 phases) get forced through a pipeline shaped for simple ones.

**Which is a problem, because:** Two failure modes emerge. (1) The CPO tries to spec something too complex in one pass and produces a thin spec that breaks during breakdown. (2) The feature sits in `created` forever because nobody signals it needs a different workflow — it's indistinguishable from features that are just waiting their turn.

**What if?** Features that need multi-round collaborative design were visibly tagged, and every skill that touches feature scheduling (standup, scrum, spec-feature) understood the tag and behaved differently — recommending iteration instead of premature speccing.

---

## Hypothesis

A lightweight tag (`needs-workshop`) on the feature record, combined with awareness in three CPO skills, is sufficient to route complex features through iterative design without adding new statuses, tables, or pipeline stages.

---

## Therefore

Add `needs-workshop` tag support to the CPO prompt and three skills (standup, scrum, spec-feature). Dashboard renders a WORKSHOP badge. No schema changes. No new pipeline stages.

---

## How This Would Work

### The Tag

Features get `needs-workshop` in their `tags` array (the `features.tags TEXT[]` column already exists with a GIN index). The tag is set by the CPO at two moments:

1. **At promotion** — when the CPO promotes an idea and judges it too complex for a single-pass spec
2. **At triage** — when reviewing created features during scrum, the CPO (or human) tags features that clearly need iterative design

The tag is removed when the human and CPO agree the design is solid enough to spec. This is an explicit action — the CPO proposes removing the tag and the human confirms.

### Touch Points (5 changes)

#### 1. CPO Prompt — Workshop Awareness Block

Add a new section after the Ideas Inbox section in the CPO role prompt:

```
## Workshop Features

Some features need multi-round collaborative design before they can be
specced. These are tagged `needs-workshop` in their tags array.

**When to tag:** At idea promotion or during scrum triage, if a feature
meets ANY of these:
- Requires architectural decisions with multiple valid approaches
- Touches 3+ existing systems that need coordinated change
- Has ambiguous requirements that need founder input to resolve
- Previous spec attempts failed or produced thin specs

**Workshop workflow:**
1. Feature stays in `created` status with `needs-workshop` tag
2. CPO drives iterative design conversations with the human
3. Each iteration produces/updates a design doc in docs/plans/active/
4. When design is solid, CPO proposes removing the tag
5. Human confirms → CPO runs /spec-feature normally

**Never spec a workshop feature without removing the tag first.**
If you start /spec-feature on a tagged feature, stop and recommend
more iteration instead.
```

#### 2. spec-feature Skill — Complexity Gate (New Step 0)

Insert before current Step 1:

```markdown
### Step 0: Workshop Check

Before presenting the feature outline, check the feature's tags array.

If `needs-workshop` is present:
- **Stop.** Do not proceed with speccing.
- Tell the human: "This feature is tagged as needing workshop iteration.
  The current design doc is at {link if known}. Want to continue
  iterating on the design, or do you think it's ready to spec?
  If ready, I'll remove the tag and we can proceed."
- If human says ready → call `update_feature` to remove the tag from
  the tags array, then proceed to Step 1
- If human says iterate → switch to design conversation mode. Read
  the existing doc, discuss changes, update the doc. Do NOT write
  spec/AC/checklist until the tag is removed.

If `needs-workshop` is NOT present, proceed to Step 1 normally.
```

#### 3. standup Skill — Workshop Bucket in Phase 2/3

In Phase 2 (Classify and Count), split the Backlog bucket:

```markdown
| Bucket | Snapshot field | Meaning |
|--------|---------------|---------|
| **Backlog (spec-ready)** | `created` WITHOUT `needs-workshop` tag | Ready for spec-feature |
| **Backlog (workshop)** | `created` WITH `needs-workshop` tag | In iterative design |
```

In Phase 3 (Present), add a Workshop section:

```markdown
**Workshop (iterating with human):**
- {feature title} — design doc at {path if known}
```

This keeps workshop features visible without mixing them into the "ready to schedule" pile.

#### 4. scrum Skill — Workshop Exclusion in Phase 2

In Phase 2 (CPO Triage), add a rule to the Backlog classification:

```markdown
### Workshop (not schedulable)
Features tagged `needs-workshop`. Cannot be greenlit or scheduled.
These are in active collaborative design and will enter the pipeline
when the tag is removed and spec-feature completes.

Present these separately: "These {N} features are in workshop —
not candidates for scheduling until design iteration completes."
```

This prevents the CPO from accidentally scheduling a complex feature that isn't ready.

#### 5. Dashboard — WORKSHOP Badge

When rendering feature cards in the Proposal column, check the tags array:

```javascript
// In renderFeatureCard() or equivalent
const isWorkshop = feature.tags?.includes('needs-workshop');
const badge = isWorkshop ? 'WORKSHOP' : 'SPECCING';
const badgeColor = isWorkshop ? '#f59e0b' : '#a855f7';  // amber vs purple
```

Workshop features get an amber WORKSHOP badge instead of the purple SPECCING badge. Visually distinct at a glance.

### What This Does NOT Change

- No new feature statuses — `needs-workshop` stays in `created`
- No schema migrations — `features.tags` already exists
- No new MCP tools — `update_feature` already supports tags
- No orchestrator changes — the orchestrator only acts on status, not tags
- No new pipeline stages — workshop is a pre-pipeline concept

---

## We Propose

Add `needs-workshop` tag support to the CPO prompt and three skills (spec-feature, standup, scrum). Dashboard renders a WORKSHOP badge. Five text changes to existing files, zero schema changes. The CPO learns to tag complex features at promotion/triage and route them through iterative design instead of premature speccing.

---

## Implementation

| # | Change | File | Effort |
|---|--------|------|--------|
| 1 | Workshop awareness block | CPO role prompt (DB `roles.prompt`) | SQL update |
| 2 | Step 0 complexity gate | `projects/skills/spec-feature.md` | ~15 lines |
| 3 | Workshop bucket in standup | `projects/skills/standup.md` | ~10 lines |
| 4 | Workshop exclusion in scrum | `projects/skills/scrum.md` | ~10 lines |
| 5 | WORKSHOP badge | `dashboard/index.html` | ~5 lines |

Total: ~40 lines of text changes across 5 files. No code, no migrations, no deployments (except the dashboard push and a roles.prompt SQL update).

Changes 1-4 are skill/prompt text — they ship via DB update and git commit. Change 5 is a dashboard tweak. All can be done in one session.
