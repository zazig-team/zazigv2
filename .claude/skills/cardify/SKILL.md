---
name: cardify
description: |
  Use when translating a design doc, roadmap, plan, or recommendation into
  Trello cards. Also use when someone says "cardify", "create cards from this",
  "push to Trello", or after producing a plan that needs actionable work items.
---

# Cardify

Translate any markdown source document into a structured card catalog, then
optionally push to Trello. The card catalog is always the source of truth.
Trello is the view.

**Design doc:** `docs/plans/2026-02-18-cardify-skill-design.md`

## Flow

```
Source Doc (.md)
    |
    v
Phase 0: Roadmap reconciliation (if plan introduces new phases/priorities)
    |-- find applicable roadmaps (project-level + macro)
    |-- propose updates, get approval
    |-- skip if plan is small / doesn't affect roadmap shape
    |
    v
Phase 1: Analyze + generate .cards.md (ALWAYS runs)
    |
    v
Phase 2: Push decision
    |-- automated (agent): push all, assign to runner
    |-- "all": push all, assign to runner
    |-- "pick": interactive per-card
    '-- "skip": markdown only, stop here
    |
    v
Trello cards created, .cards.md updated with URLs
```

## Phase 0: Roadmap Reconciliation

Before generating cards, check whether this plan changes the shape of the
roadmap. Small plans (bug fixes, single features) skip this. Plans that
introduce new phases, reorder priorities, or add workstreams should update
the roadmap first so cards are created against an accurate strategic view.

### 1. Determine if reconciliation is needed

Read the source doc and ask: does this plan introduce new phases, change
priority order, add or remove workstreams, or shift timelines? If yes,
proceed. If no, skip to Phase 1.

**Automated (agent):** always skip Phase 0 — agents don't update roadmaps.
**Interactive:** ask the user:

> This plan introduces {new phases / priority changes / new workstream}.
> Update the roadmap before generating cards? [yes / skip]

### 2. Find applicable roadmaps

A plan may affect up to two roadmaps:

| Roadmap | Location | When it applies |
|---------|----------|-----------------|
| **Project roadmap** | `{project_dir}/docs/ROADMAP.md` | When the plan lives inside a project that has its own roadmap (e.g. an inner repo created via `/init`) |
| **Macro roadmap** | `{product_root}/docs/ROADMAP.md` | The top-level product roadmap — always checked |

Search order:
1. Look for `docs/ROADMAP.md` in the same directory tree as the source doc (walk up until found)
2. Look for `docs/ROADMAP.md` in the product root (the git repo root, or the parent project if this is a sub-project)
3. If both are the same file, treat as one roadmap

If no roadmap exists at either level, skip Phase 0 entirely.

### 3. Propose roadmap updates

For each applicable roadmap:
1. Read the current roadmap
2. Read the source plan
3. Produce a diff showing proposed changes — new sections, reordered items, updated phase descriptions
4. Present to the user for approval

Format the proposal as:
```
Roadmap: {path}

Changes:
- Add Phase X: "{title}" after Phase Y
- Move "{item}" from Phase A to Phase B
- Update "{section}" description to reflect {change}

No changes to: {unchanged sections}
```

### 4. Apply approved changes

Edit the roadmap file(s) with approved changes. Do not rewrite unchanged
sections — surgical edits only. If the user rejects changes, proceed to
Phase 1 with the roadmap as-is.

## Phase 1: Generate Card Catalog

### 1. Read the source document

Parse the markdown. Identify:
- **Title** from first `#` heading
- **Tiers/groups** — does it have priority tiers (Tier 1, Tier 2...) or thematic groups (Security, Memory, UX...)?
- **Card candidates** — sections that describe discrete work items
- **Dependencies** between items (explicit or inferred from text)

### 2. Determine numbering scheme

| Source structure | Numbering | Example |
|-----------------|-----------|---------|
| Priority tiers (Tier 1, Quick Wins, etc.) | `{tier}.{index}` | `1.1`, `2.3`, `S.1` |
| Thematic groups (Security, Memory, etc.) | `{GROUP}.{index}` | `SEC.1`, `MEM.2` |
| Flat list (no grouping) | Sequential | `1`, `2`, `3` |

For tier numbering, use `S.{index}` for scale-up/deferred items.

### 3. Resolve target board

Priority order:
1. Source doc frontmatter: `board: Board Name` or `board-id: abc123`
2. Source doc is inside a project dir → check `zazig.yaml` or instance context for board mapping
3. Ask user to pick from available boards

To resolve boards from config:
```bash
# Read zazig.yaml trello.boards section, or:
ZAZIG_INSTANCE_ID={id} trello-lite boards
```

### 4. Generate the `.cards.md` sibling file

Write to `{source-filename}.cards.md` in the same directory.

**Header:**
```markdown
# Card Catalog: {Source Doc Title}
**Source:** {relative path to source doc}
**Board:** {board name} ({board ID})
**Generated:** {ISO 8601 timestamp}
**Numbering:** {tier.index | group.index | sequential}
```

**Build Sequence** — how the cards build on each other:
```markdown
## Build Sequence

**Critical path:** `{first card} → ... → {bottleneck card}` (label each step)

{ASCII dependency diagram showing parallel tracks}

{One sentence: what to ship first, what can run in parallel, what closes it out}

**How they build on each other:**

- **{ID} ({Title})** — {Why this is first / what it creates that others need}
- **{ID} ({Title})** ← {deps} — {What it takes from predecessors, what it produces for successors}
- ...repeat for each card...
```

The build sequence must answer three questions:
1. **What's the critical path?** — the longest chain that determines total time
2. **What can run in parallel?** — cards that share a predecessor but don't depend on each other
3. **How does each card feed the next?** — not just "depends on 1.1" but WHY (what data, what interface, what schema)

**Per card:**
```markdown
---

### {ID} -- {Title}
| Field | Value |
|-------|-------|
| Type | Feature / Design / Architecture |
| Complexity | Low / Medium / High |
| Model | Codex / Sonnet 4.6 / Opus 4.6 |
| Labels | codex-first, tech-review, etc. |
| Depends on | {other card IDs, or --} |
| Assigned | {name or _unassigned_} |
| Trello | _not pushed_ |

**What:** One paragraph. What this is and what it does.

**Why:** One paragraph. Why we're doing this and what it unblocks.

**Files:** Bullet list of affected files.

**Gotchas:** Bullet list of risks and edge cases.

**Implementation Prompt:**
> A detailed, ready-to-use prompt that an implementing agent (VP-Eng,
> Codex) can pick up cold. Include: task description, constraints,
> acceptance criteria, specific file paths and line numbers from the
> source analysis, and references back to the source doc section.
> Write this as if handing off to someone with no prior context.
```

### 5. Card field guidance

**Type:**
- `Feature` — new capability or enhancement
- `Design` — design doc, investigation, or specification work (output is a document)
- `Architecture` — structural change that affects multiple systems

**Complexity:**
- `Low` — hours, single file, mechanical
- `Medium` — days, multiple files, requires some judgment
- `High` — week+, cross-cutting, needs design decisions

**Model (token budget):**
- `Codex` — mechanical implementation, clear spec, no ambiguity
- `Sonnet 4.6` — moderate reasoning, concurrency, multi-file changes
- `Opus 4.6` — deep strategy, architecture, role design, complex tradeoffs

**Labels** — map from card fields:

| Card field | Label |
|-----------|-------|
| Model: Codex | `codex-first` |
| Model: Sonnet or Opus | `claude-ok` |
| Type: Design | `design` |
| CTO review needed | `tech-review` |
| Has unresolved dependencies | `blocked` |
| Research/investigation | `research` |

**Implementation Prompt** — this is the highest-value field. Write it as a
self-contained task brief. Include:
- What to build (specific, not vague)
- Which files to modify (with line refs from source analysis if available)
- Constraints and edge cases
- Acceptance criteria (what "done" looks like)
- Source doc reference for full context

## Phase 2: Push to Trello

### Decision point

After Phase 1 completes, present the card catalog summary and ask:

**Interactive terminal:**
> Generated {N} cards in `{path}.cards.md`.
> Push to Trello ({board name})?
> - **all** — push all cards to Backlog, assign to {runner}
> - **pick** — review each card interactively
> - **skip** — keep markdown only, don't push

**Automated (agent, no terminal):** Default to "all" with runner assignment.

### Push "all" mode

1. Fetch board labels: `trello-lite labels {board-id}`
2. Fetch board lists: `trello-lite lists {board-id}` — resolve Backlog list ID
3. Per card:
   - Build description from card template fields
   - `trello-lite create {backlog-list-id} "{ID} -- {title}" "{description}" --labels {label-ids}`
   - If assigned: `trello-lite label {card-id} {assigned-X-label-id}`
4. Update `.cards.md` — set each card's `Trello` field to the card URL
5. Update `Assigned` fields

### Push "pick" mode (interactive)

Group cards for batch decisions:

```
Mechanical work (Codex-first): 1.1, 1.2, 1.3, 2.1
  Assign all to: [Tom] [Chris] [Unassigned]

Needs CTO review: 1.4, 2.3
  These get tech-review label. Assign? [Unassigned] [Chris]

Design work: 3.3
  Assign to: [Tom] [Chris] [Unassigned]
```

Use AskUserQuestion for each group. Then push with resolved assignments.

### Assignment logic

- **Automated:** assign to whoever's running (`ZAZIG_INSTANCE_ID` + collaborator context)
- **Interactive:** ask per group (default to unassigned)
- `tech-review` cards: default to unassigned (CTO picks up during review cycle)
- Unassigned cards: picked up during scrum

Read collaborator names from instance config:
```bash
# zazig.yaml → collaborators[].name
# Yields: Tom, Chris (for zazig instance)
```

### Idempotency

If `.cards.md` already has Trello URLs, offer to **update existing cards**
instead of creating duplicates. Match on card name prefix (`{ID} --`).
Use `trello-lite update {card-id} --desc "{new-desc}"` for updates.

## Trello Card Description Format

The Trello card description is a condensed version of the `.cards.md` entry.
Use this format for the `desc` field passed to `trello-lite create`:

```markdown
**Type:** {type} | **Complexity:** {complexity} | **Model:** {model}
**Depends on:** {deps or None}
**Source:** {relative path to source doc}

## What
{what paragraph}

## Why
{why paragraph}

## Files
{bullet list}

## Gotchas
{bullet list}

## Implementation Prompt
{the full prompt}
```

## Quick Reference

| Action | Command |
|--------|---------|
| List boards | `trello-lite boards` |
| Get board with lists | `trello-lite board {id}` |
| List labels | `trello-lite labels {board-id}` |
| Create card | `trello-lite create {list-id} "name" "desc" --labels ids` |
| Add label | `trello-lite label {card-id} {label-id}` |
| Update card | `trello-lite update {card-id} --desc "new desc"` |
| Move card | `trello-lite move {card-id} {list-id}` |

## Common Mistakes

- **Forgetting `ZAZIG_INSTANCE_ID`** — always set it before trello-lite calls
- **Vague implementation prompts** — the prompt should be specific enough to hand off cold. Include file paths, line numbers, constraints.
- **Shallow dependency graphs** — don't just draw arrows between card IDs. Write a build sequence that explains WHY each card depends on its predecessors and what it produces for successors. An implementer picking up card 1.5 should understand what 1.1-1.4 gave them without reading those cards.
- **Missing dependency tracking** — if card A must complete before card B, both the `Depends on` field AND the `blocked` label must reflect this
- **Creating duplicate cards** — check if `.cards.md` already has Trello URLs before pushing
- **Not updating `.cards.md` after push** — the markdown must stay in sync with Trello state
