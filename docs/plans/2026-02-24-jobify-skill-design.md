# Jobify Skill Design — V2

**Date:** 2026-02-24
**Status:** Draft
**Author:** Tom + Claude (brainstorming session)
**Replaces:** Cardify (V1 Trello-based card creation)
**Reviewed by:** Codex (gpt-5.3) and Gemini (3.1 Pro) — feedback incorporated

---

## Overview

Jobify takes a fully-specced feature and breaks it into executable jobs with strict Gherkin acceptance criteria, then pushes them to the Supabase `jobs` table. It replaces cardify's role in the pipeline — jobs are the V2 equivalent of cards, Supabase is the V2 equivalent of Trello.

**What it does:**
- Reads a feature (from Supabase or a local plan doc)
- Breaks it into jobs sized for one agent session (target: under 30 minutes of agent time — if an agent takes longer, the job is likely too big and should be re-broken)
- Generates Gherkin acceptance criteria with unique IDs per job
- Routes each job by complexity/model/role
- Produces a build sequence with dependency reasoning (DAG via `depends_on` UUID array)
- Pushes jobs to Supabase (directly to `queued` status)

**What it does NOT do:**
- Create features (that's the CPO via `create_feature` MCP tool)
- Generate test code (that's the implementing agent's job)
- Enforce Red→Green TDD loop (that's the orchestrator)
- Manage branches (orchestrator creates `feature/` and `job/` branches)
- Deploy, verify, or ship (all orchestrator)

---

## Where Jobify Fits in the Pipeline

```
ENTRY POINTS
  |-- User talks to CPO (Slack)
  |-- Exec proposes to CPO
  |-- Market researcher spots signal → CPO
  |
  v
[1] CPO TRIAGE — checks existing projects, recommends scope
  |-- Single feature → [4]
  |-- Whole project → [2]
  |
  v
[2] PROJECT DESIGN — architecture docs, research, iteration
  |
  v
[3] PROJECT → FEATURES — break project into features (featurify, future)
  |
  v
[4] FEATURE DESIGN — CPO enriches spec + AC via conversation
  |  CPO calls create_feature, update_feature (MCP tools)
  |  Status: 'created' → 'ready_for_breakdown'
  |
  v
[5] JOB BREAKDOWN ← THIS IS JOBIFY
  |  Triggered by feature status → 'ready_for_breakdown'
  |  Orchestrator spawns breakdown specialist with jobify skill
  |  Reads feature from Supabase, breaks into jobs
  |  Output: jobs in Supabase (status: 'queued', with depends_on DAG)
  |
  v
[6-10] EXECUTION → VERIFICATION → TESTING → SHIP (orchestrator)
```

**The handoff:** When the CPO calls `update_feature` with `status: 'ready_for_breakdown'`, the orchestrator picks up the event, spawns a breakdown specialist job, and that agent runs jobify.

---

## Input Modes

### Mode 1: Feature ID (automated pipeline — primary)

```
/jobify --feature <uuid>
```

- Reads the feature from Supabase (`features` table)
- Feature must have `spec` and `acceptance_tests` populated
- Breaks into jobs, pushes back to Supabase under that `feature_id`
- This is how the orchestrator triggers it (via breakdown specialist agent)

### Mode 2: Doc Path (manual — Tom's Claude Code session)

```
/jobify docs/plans/some-plan.md
```

- Reads the markdown plan doc
- Looks up or creates a feature in Supabase from the doc content
- Then proceeds as Mode 1
- For when you're working locally and want to push a plan through the pipeline

### Mode 3: Standalone (escape hatch — orphan jobs)

```
/jobify --standalone "fix the favicon"
```

- Creates a single orphan job with `feature_id: null`
- Still requires spec + at least 1 Gherkin acceptance criterion
- Tagged `standalone` in the job record
- Goes straight to `queued` status
- CPO reviews standalone jobs periodically

---

## Acceptance Criteria Format

Every job's `acceptance_tests` field uses Gherkin format with unique criterion IDs. This format was chosen based on independent review by Codex (gpt-5.3) and Gemini (3.1 Pro) — both recommended strict, testable criteria with IDs over test skeletons or vague specs.

### Format

```gherkin
AC-{JOB_SEQ}-001: {Short description}
  Given {precondition}
  When {action}
  Then {observable outcome}
  And {additional outcome}

AC-{JOB_SEQ}-002: {Short description}
  Given {precondition}
  When {failure condition}
  Then {expected failure behaviour}
```

### Example

For a job "Implement Google OAuth callback handler":

```gherkin
AC-3-001: Valid OAuth code creates session
  Given an authenticated request to POST /auth/google/callback
  When the authorization code is valid and not expired
  Then a 200 response is returned
  And a session cookie is set with httpOnly flag
  And the cookie expires after 24 hours
  And a user record exists in the users table

AC-3-002: Expired code is rejected
  Given an authenticated request to POST /auth/google/callback
  When the authorization code has expired
  Then a 401 response is returned
  And no session cookie is set
  And the response body contains error "code_expired"

AC-3-003: Missing code parameter returns 400
  Given a request to POST /auth/google/callback
  When the code parameter is missing from the request body
  Then a 400 response is returned
  And the response body contains error "code_required"
```

### Quality Rules (enforced by the skill)

- Every criterion must have Given, When, Then (all three required)
- "Then" must specify observable outcomes (status codes, state changes, error messages, data assertions)
- No vague language: "works correctly", "handles errors", "is secure" → rejected, must be specific
- Minimum 2 criteria per job (happy path + at least one failure/edge case)
- Criterion IDs enable traceability: verifier can check that test code exists for each AC ID

### Why This Approach

Both Codex and Gemini independently concluded:
- **Option A (loose specs):** Too much freedom for AI agents — they write minimal tests that are easy to pass
- **Option B (test skeletons):** Brittle coupling to project structure — the breakdown skill doesn't have LSP access, will guess imports wrong
- **Option C (strict criteria):** Best balance — framework-agnostic, specific enough to drive implementation, but doesn't couple the planning phase to the coding phase

Key insight: **TDD enforcement belongs in the orchestrator (Red→Green gate), not in the skill.** The skill produces the contract; the orchestrator enforces the process.

---

## Job Fields

Each job pushed to Supabase includes:

| Field | Description | Example |
|-------|-------------|---------|
| `feature_id` | Parent feature UUID (null for standalone) | `abc-123` |
| `spec` | What to build — specific, self-contained | Markdown paragraph |
| `acceptance_tests` | Gherkin criteria with IDs (see format above) | Text block |
| `role` | Which agent type executes this | `senior-engineer` |
| `job_type` | Category of work | `code` / `infra` / `design` / `research` / `docs` |
| `complexity` | Estimated effort | `simple` / `medium` / `complex` |
| `model` | Routed from complexity | `codex` / `sonnet` / `opus` |
| `depends_on` | UUIDs of jobs that must complete before this one can start | `[uuid-1, uuid-2]` or `[]` |
| `status` | Always starts as | `queued` |

**Note on `depends_on` vs `sequence`:** The existing `sequence` integer column cannot represent parallel job dependencies (a DAG). Jobify uses `depends_on` (UUID array) instead. The orchestrator dispatches any job whose `depends_on` jobs all have `status: 'complete'`. Jobs with empty `depends_on` are immediately dispatchable. This requires a schema migration — see Dependencies section.

**Note on initial status:** Jobs push directly to `queued`, not `design`. The `design` status belongs to the feature-level CPO conversation. By the time jobify creates jobs, the spec and acceptance criteria are fully defined — there's nothing left to design. If the breakdown is bad, it will fail at the job or feature verification gates and get routed back.

### Complexity → Model Routing

| Complexity | Model | When to use |
|-----------|-------|-------------|
| `simple` | Codex | Mechanical implementation, clear spec, single file, no ambiguity |
| `medium` | Sonnet 4.6 | Multi-file changes, moderate reasoning, some judgment needed |
| `complex` | Opus 4.6 | Architecture decisions, cross-cutting concerns, deep tradeoffs |

### Job Type Guidance

| Type | Description |
|------|-------------|
| `code` | Implementation work — new features, bug fixes, refactoring |
| `infra` | Infrastructure — CI/CD, deployment, environment setup |
| `design` | Design work — output is a document, not code |
| `research` | Investigation — explore options, produce recommendation |
| `docs` | Documentation — README, API docs, guides |

---

## Build Sequence & Dependency Graph

Every jobify run produces a build sequence that explains:
1. **Critical path** — the longest dependency chain that determines total time
2. **What can run in parallel** — jobs with no mutual dependencies that the orchestrator can dispatch simultaneously
3. **How each job feeds the next** — not just "depends on job 1" but WHY (what data, what interface, what schema it produces that the next job needs)

The build sequence is encoded in the `depends_on` field (UUID array) on each job. The orchestrator dispatches any job whose `depends_on` jobs all have `status: 'complete'`. Jobs with `depends_on: []` are immediately dispatchable.

### Format (in .jobs.md and review output)

```markdown
## Build Sequence

**Critical path:** Job 1 (schema) → Job 3 (API routes) → Job 5 (integration tests)

Job 1 ──→ Job 3 ──→ Job 5
Job 2 ──→ Job 4 ──/
     (parallel)

**Dependency graph (as stored in Supabase):**
- Job 1: depends_on: [] (root — immediately dispatchable)
- Job 2: depends_on: [Job 1]
- Job 3: depends_on: [Job 1, Job 2]
- Job 4: depends_on: [Job 1] (parallel with Jobs 2-3)
- Job 5: depends_on: [Job 3, Job 4]

**How they build on each other:**

- **Job 1 (Create users table schema)** — Root job. Produces the table schema that Jobs 2-4 all depend on for types and queries.
- **Job 2 (Auth middleware)** ← Job 1 — Needs the user type from Job 1's schema. Produces the auth middleware that Job 3's routes will import.
- **Job 3 (API routes)** ← Job 1, Job 2 — Needs schema for DB queries and auth middleware for route protection. Produces the endpoints that Job 5 tests end-to-end.
- **Job 4 (Frontend auth UI)** ← Job 1 — Only needs user types from Job 1. Can run in parallel with Jobs 2-3. Produces the login/signup components.
- **Job 5 (Integration tests)** ← Job 3, Job 4 — Needs working API routes and frontend. Validates the full flow.
```

---

## Implementation Prompt

Each job includes an implementation prompt — a self-contained task brief that an implementing agent can pick up cold. This is the highest-value field.

### Template

```markdown
## Task: {Job Title}

**Feature:** {feature title} ({feature_id})
**Job:** {sequence} of {total} | {complexity} | {model}

### What to Build
{Specific description of what this job implements}

### Acceptance Criteria
{Full Gherkin AC block — copied from acceptance_tests field}

### TDD Instructions
Write failing tests FIRST for each acceptance criterion (AC-{SEQ}-001, AC-{SEQ}-002, etc.).
Run tests to confirm they fail (Red). Then implement until all pass (Green).
Do not modify or weaken acceptance criteria.

### Files to Modify
{Bullet list of expected files — only included when the breakdown specialist has repo access and can verify paths exist. Omitted in automated mode if repo is not mounted.}

### Constraints
{Edge cases, security considerations, performance requirements}

### Dependencies
{What predecessor jobs produced that this job consumes — specific files, schemas, interfaces}

### Source Context
{Reference to source plan doc or feature spec for full context}
```

---

## .jobs.md Local Reference

When run locally (doc path or manual mode), jobify writes a `.jobs.md` sibling file for local reference. This mirrors the old `.cards.md` format but with Supabase job IDs instead of Trello URLs.

**Header:**
```markdown
# Job Catalog: {Feature Title}
**Feature:** {feature_id}
**Source:** {relative path to source doc}
**Generated:** {ISO 8601 timestamp}
```

**Per job:** Summary of spec, AC count, complexity, model, sequence, Supabase job ID.

In automated mode (orchestrator-triggered), no local file is written — everything goes directly to Supabase.

---

## Supabase Integration

### Reading Features

```typescript
// Query feature by ID
const { data: feature } = await supabase
  .from('features')
  .select('*')
  .eq('id', featureId)
  .single();
```

### Creating Jobs (batch)

Jobs are inserted in dependency order so that `depends_on` UUIDs can reference earlier jobs. In automated mode, this should use a `batch_create_jobs` MCP tool that lets the backend validate the schema and resolve the dependency graph atomically.

```typescript
// Insert jobs sequentially to resolve depends_on references
const createdJobs: Record<string, string> = {}; // tempId → realId

for (const job of jobRecords) {
  const resolvedDeps = job.dependsOn.map(tempId => createdJobs[tempId]);
  const { data } = await supabase
    .from('jobs')
    .insert({
      feature_id: featureId,
      company_id: feature.company_id,
      spec: job.spec,
      acceptance_tests: job.acceptanceTests,
      role: job.role,
      job_type: job.jobType,
      complexity: job.complexity,
      model: job.model,
      depends_on: resolvedDeps,
      status: 'queued',
    })
    .select()
    .single();
  createdJobs[job.tempId] = data.id;
}
```

### Standalone Jobs

```typescript
// Insert orphan job
const { data: job } = await supabase
  .from('jobs')
  .insert({
    feature_id: null,
    company_id: companyId,
    spec: standaloneSpec,
    acceptance_tests: standaloneAC,
    role: routedRole,
    job_type: inferredType,
    complexity: estimatedComplexity,
    model: routedModel,
    sequence: 1,
    status: 'queued',
  })
  .select()
  .single();
```

---

## What This Skill Needs to Work

| Dependency | Status | Owner |
|-----------|--------|-------|
| `features` table with spec + acceptance_tests | Exists | Chris |
| `jobs` table with all required columns | Exists | Chris |
| **`depends_on` UUID array column on `jobs` table** | **Needs migration** | **Chris** |
| `create_feature` MCP tool (for doc path mode) | In progress | Chris |
| `update_feature` MCP tool | In progress | Chris |
| `query_projects` MCP tool (for context) | In progress | Chris |
| **`batch_create_jobs` MCP tool** | **Needs building** | **Chris** |
| Supabase API access (anon key or service role key) | Available via Doppler | - |
| Feature status `ready_for_breakdown` event | In Chris's pipeline design | Chris |
| Breakdown specialist role in `roles` table | Needs creating | Tom/Chris |
| **Orchestrator: dispatch jobs where all `depends_on` are complete** | **Needs updating** | **Chris** |

---

## Resolved Questions (from review)

1. **Should the CPO review the job breakdown before jobs go to `queued`?**
   **Answer: No.** Push directly to `queued`. Jobify guarantees spec + acceptance_tests are populated (the schema requirement for `queued`). If the breakdown is bad, it will fail at job or feature verification gates and get routed back. Adding a CPO review step here would break the automated pipeline flow.

2. **How does jobify get Supabase access when run as a skill?**
   **Answer:** In automated mode, strictly use MCP tools (`batch_create_jobs`, `query_projects`). Don't mix REST API calls and MCP tools — it fragments the auth model. In manual mode (Tom's Claude Code session), use the same MCP tools if available, or fall back to REST API with Doppler credentials.

3. **Should there be a `batch_create_jobs` MCP tool?**
   **Answer: Yes.** The breakdown specialist needs to push multiple jobs atomically. A batch MCP tool lets the backend edge function validate the schema, resolve the `depends_on` graph, and safely insert. Chris should add this alongside `create_feature` and `update_feature`.

4. **Should the breakdown specialist have repo access for "Files to Modify"?**
   **Answer:** The breakdown specialist runs on a local machine with the repo present (same as any other agent). It can read the codebase to produce accurate file paths. In cases where repo access isn't available, the "Files to Modify" section is omitted and left to the implementing agent.

## Remaining Open Questions

1. **Project → Feature breakdown (featurify):** Separate skill needed for step [3] of the pipeline. Not designed yet, follows the same pattern — takes a project, breaks into features, pushes to Supabase. Future work.

2. **Parallel job file conflicts:** If two parallel jobs modify the same file, the second to merge will hit a conflict during rebase. Should jobify flag potential file overlaps in the build sequence? Or is this purely the orchestrator's problem (hand conflict resolution to a fix agent)?

3. **Pipeline design doc alignment:** The pipeline design doc (`2026-02-20-software-development-pipeline-design.md`) says the CPO breaks features into jobs. This should be updated to reflect that a breakdown specialist (with jobify) does it. The CPO owns feature design only.

4. **Acceptance test immutability:** For critical flows (auth, billing, permissions), should acceptance tests be marked immutable so implementing agents cannot silently weaken them? This could be a `critical: true` flag on specific AC IDs that the verifier treats as mandatory.
