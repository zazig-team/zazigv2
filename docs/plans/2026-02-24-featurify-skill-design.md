# Featurify Skill Design

**Date:** 2026-02-24
**Status:** Draft
**Author:** Tom + Claude (brainstorming session)
**Pattern:** Mirrors jobify — same Contractor Pattern (skill + MCP). See `2026-02-24-idea-to-job-pipeline-design.md` Section 6, "The Contractor Pattern."
**Companion:** `2026-02-24-jobify-skill-design.md` (the job-level equivalent)

---

## Overview

Featurify takes an approved project plan and breaks it into feature outlines, then pushes them to the Supabase `features` table. It is to the Project Architect what jobify is to the Breakdown Specialist.

**What it does:**
- Reads a project plan (from Supabase or a local plan doc)
- Breaks it into features — each representing a user-visible capability
- Produces feature outlines with enough spec for the CPO to refine (not fully specced — that's the CPO's job in Stage 4)
- Identifies inter-feature dependencies and a recommended build order
- Pushes features to Supabase with `status: created`

**What it does NOT do:**
- Fully spec features (that's the CPO + Human in Stage 4)
- Write acceptance criteria or human checklists (that's Stage 4)
- Break features into jobs (that's the Breakdown Specialist via jobify)
- Make product decisions about scope or priority (that's the CPO)

---

## Where Featurify Fits in the Pipeline

```
[1] IDEATION         Human has an idea, talks to CPO
[2] PLANNING         CPO + Human refine scope, approve plan
  |
  v
[3] STRUCTURING ← THIS IS FEATURIFY
  |  Triggered by: CPO commissions a Project Architect
  |  Orchestrator dispatches Project Architect with featurify skill
  |  Reads project plan, breaks into feature outlines
  |  Output: features in Supabase (status: 'created')
  |  Orchestrator notifies CPO when complete
  |
  v
[4] FEATURE DESIGN   CPO takes each feature outline, specs it with human
[5] BREAKDOWN        Breakdown Specialist runs jobify per feature
```

**The handoff:** CPO approves a plan and commissions a Project Architect. The orchestrator dispatches the contractor. The Project Architect runs featurify. When complete, the orchestrator notifies the CPO, who reviews the feature outlines and proceeds to spec each one.

---

## Input Modes

### Mode 1: Project ID (automated pipeline — primary)

```
/featurify --project <uuid>
```

- Reads the project from Supabase (`projects` table)
- Project must have a plan or description populated
- Breaks into features, pushes back to Supabase under that `project_id`
- This is how the orchestrator triggers it (via Project Architect contractor)

### Mode 2: Doc Path (manual — Tom's Claude Code session)

```
/featurify docs/plans/some-plan.md
```

- Reads the markdown plan doc
- Looks up or creates a project in Supabase from the doc content
- Then proceeds as Mode 1
- For when you're working locally and want to push a plan through the pipeline

---

## Feature Outline Format

Each feature pushed to Supabase includes enough detail for the CPO to refine, but is deliberately incomplete — the CPO and human will enrich it during Stage 4.

### Feature Fields

| Field | Description | Example |
|-------|-------------|---------|
| `project_id` | Parent project UUID | `proj-abc-123` |
| `title` | Clear, descriptive feature name | "User Authentication via OAuth" |
| `description` | 2-3 paragraph outline of what this feature does and why | Markdown |
| `suggested_priority` | Project Architect's recommendation | `high` / `medium` / `low` |
| `depends_on_features` | UUIDs of features that should be built first | `[feat-1, feat-2]` or `[]` |
| `status` | Always starts as | `created` |
| `spec` | Empty — CPO fills this in Stage 4 | `null` |
| `acceptance_tests` | Empty — CPO fills this in Stage 4 | `null` |
| `human_checklist` | Empty — CPO fills this in Stage 4 | `null` |

### What a good feature outline includes

- **What:** One paragraph describing the capability from the user's perspective
- **Why:** One paragraph explaining why this feature matters and what it unblocks
- **Scope boundaries:** What's in and what's explicitly out (prevents CPO from expanding scope)
- **Technical notes:** Any architectural constraints or dependencies the CPO should be aware of during spec (not a full design — just flags)

### What a feature outline does NOT include

- Full spec (CPO's job)
- Acceptance criteria (CPO's job)
- Human checklist (CPO's job)
- Implementation details (implementing agent's job)
- Job breakdown (Breakdown Specialist's job)

The Project Architect's job is to identify the right *boundaries* between features. Getting the boundaries right is the hard part — if a feature is too big, jobify will produce too many jobs; if it's too small, the overhead of spec + breakdown per feature is wasted.

---

## Feature Sizing Guidance

| Signal | Feature is too big | Feature is too small |
|--------|-------------------|---------------------|
| Job count | Would produce >10 jobs | Would produce 1-2 jobs |
| Spec length | Would need >2 pages of spec | Can be fully specced in a paragraph |
| Dependencies | Has internal dependencies (parts depend on other parts) | Is a single atomic change |
| Testing | Needs multiple test strategies (unit, integration, e2e) | One test file covers it |

**Target:** Each feature should produce 3-7 jobs when broken down by jobify. This is the sweet spot — enough to parallelize, not so many that coordination overhead dominates.

---

## Build Order & Feature Dependencies

Every featurify run produces a recommended build order:

1. **Which features can be built in parallel** — features with no mutual dependencies
2. **Which features must be sequenced** — feature B needs the database schema from feature A
3. **Why each dependency exists** — not just "depends on A" but what A produces that B needs

### Format

```markdown
## Feature Build Order

**Critical path:** Feature 1 (data model) → Feature 3 (API) → Feature 5 (integration)

Feature 1 ──→ Feature 3 ──→ Feature 5
Feature 2 ──→ Feature 4 ──/
     (parallel)

**Dependencies:**
- Feature 1: depends_on: [] — Foundation. Creates the database schema all other features build on.
- Feature 2: depends_on: [] — Independent UI work. Can run in parallel with Feature 1.
- Feature 3: depends_on: [Feature 1] — Needs the schema from Feature 1 for API routes.
- Feature 4: depends_on: [Feature 2] — Builds on Feature 2's UI components.
- Feature 5: depends_on: [Feature 3, Feature 4] — Integration testing needs both API and UI.
```

**Note:** Feature-level dependencies are advisory — the CPO may reorder based on product priorities. The `depends_on_features` field captures technical dependencies; the CPO owns the prioritization decision.

---

## Supabase Integration

### Reading Projects

In automated mode, the Project Architect reads the project via MCP:

```
query_projects(project_id: "proj-abc-123", include_features: false)
```

### Creating Features (batch)

Features are inserted via a `batch_create_features` MCP tool. This lets the backend edge function validate the schema and insert atomically.

```typescript
// batch_create_features MCP tool call
{
  project_id: "proj-abc-123",
  features: [
    {
      title: "User Authentication via OAuth",
      description: "...",
      suggested_priority: "high",
      depends_on_features: [],  // resolved to UUIDs after insert
    },
    {
      title: "Session Management",
      description: "...",
      suggested_priority: "high",
      depends_on_features: ["temp-id-1"],  // references first feature
    },
  ]
}
```

The edge function resolves temporary IDs to real UUIDs (same pattern as jobify's `batch_create_jobs`), inserts all features with `status: created`, and returns the created feature IDs.

---

## .features.md Local Reference

When run locally (doc path mode), featurify writes a `.features.md` sibling file. Mirrors the jobify `.jobs.md` pattern.

**Header:**
```markdown
# Feature Catalog: {Project Name}
**Project:** {project_id}
**Source:** {relative path to source doc}
**Generated:** {ISO 8601 timestamp}
```

**Per feature:** Title, description summary, suggested priority, dependencies, Supabase feature ID.

In automated mode, no local file is written — everything goes directly to Supabase.

---

## What This Skill Needs to Work

| Dependency | Status | Owner |
|-----------|--------|-------|
| `projects` table with description/plan field | Exists | Chris |
| `features` table with all required columns | Exists | Chris |
| **`depends_on_features` UUID array column on `features` table** | **Needs migration** | **Chris** |
| **`suggested_priority` column on `features` table** | **Needs migration** | **Chris** |
| `query_projects` MCP tool | Built | Chris |
| **`batch_create_features` MCP tool** | **Needs building** | **Chris** |
| **`create_project` MCP tool** | **Needs building** | **Chris** |
| Project Architect role in `roles` table | Needs creating | Tom/Chris |
| Orchestrator: notify CPO when structuring complete | Needs building | Chris |

---

## Relationship to Jobify

Featurify and jobify are symmetrical skills following the same Contractor Pattern:

| | Featurify | Jobify |
|---|-----------|--------|
| **Contractor** | Project Architect | Breakdown Specialist |
| **Input** | Project plan | Feature spec |
| **Output** | Feature outlines | Executable jobs |
| **Output status** | `created` (CPO refines) | `queued` (orchestrator dispatches) |
| **Skill** | featurify | jobify |
| **MCP reads** | `query_projects` | `query_features` |
| **MCP writes** | `batch_create_features` | `batch_create_jobs` |
| **Quality gate** | CPO reviews outlines | Verification gates check jobs |
| **Sizing target** | 3-7 features per project | 3-7 jobs per feature |

The key difference: featurify produces *outlines* that the CPO must enrich (Stage 4), while jobify produces *complete* jobs that go directly to `queued`. This is because features need human input (requirements, priorities, acceptance criteria) while jobs are pure decomposition of already-specced work.

---

## Open Questions

1. **Should the CPO review feature outlines before they're visible?** Currently, features go to `created` and the CPO is notified. The CPO then reviews and specs each one. But should the Project Architect's output go through a review gate first? Current lean: no — same reasoning as jobify. If the outlines are bad, the CPO will catch it during Stage 4.

2. **Feature-level acceptance criteria format:** Should features use the same Gherkin format as jobs, or a higher-level format? Features are user-facing ("user can log in with Google") while jobs are implementation-facing ("OAuth callback handler returns 200 with session cookie"). The CPO probably writes feature-level AC in natural language, and jobify translates to Gherkin at the job level.

3. **`depends_on_features` vs build order:** The `depends_on_features` field captures technical dependencies. But the CPO may want to build features in a different order for product reasons (ship the high-value feature first even if it's technically independent). Should `depends_on_features` be advisory or enforced?

4. **Project plan format:** What does the project plan look like in Supabase? Is it a text field on the `projects` table? A separate `project_plans` table? A markdown doc referenced by path? This determines what featurify reads as input in automated mode.
