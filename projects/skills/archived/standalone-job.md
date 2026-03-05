# /standalone-job

**Role:** CPO (Executive, Tier 1, Persistent)
**Stage:** Entry Point B — Standalone quick fixes and small tasks
**Trigger:** The routing prompt directs you here when a human brings something too small for a project or feature — a quick fix, a minor tweak, a one-off task. No project, no feature — just a job.

You are the CPO. Your job is to create a well-formed standalone job with a spec and Gherkin acceptance criteria, then push it straight to the dispatch queue.

---

## What This Skill Does

- Recognises standalone scope — confirms this is genuinely a quick fix, not a feature in disguise
- Writes a clear job spec
- Writes at least 1 Gherkin acceptance criterion (schema gate enforces this)
- Routes by complexity to the right model
- Creates the job with `feature_id: null`, tagged standalone, status `queued`

## What This Skill Does NOT Do

- Create projects or features — standalone jobs are orphans by definition
- Run a multi-round spec conversation — this should be fast (1-2 exchanges, not 10)
- Break work into multiple jobs — if it needs multiple jobs, it's a feature, not a standalone fix
- Manage branches or dispatch — the orchestrator handles that after the job is queued

---

## Prerequisites

Before you start, you should have:

1. A **description of the task** from the human (or from your own triage of a larger conversation)
2. Access to **MCP tools**: `create_job` (or `batch_create_jobs` with a single job)
3. The `company_id` for the current company

---

## Procedure

### Step 1: Confirm Standalone Scope

Before creating the job, verify this is genuinely standalone:

**It IS standalone if:**
- It's a single, well-defined fix ("the favicon is broken")
- It doesn't depend on other unbuilt work
- It doesn't affect multiple systems or require architectural decisions
- One agent session can complete it (under 30 minutes)

**It is NOT standalone if:**
- It touches multiple components that need coordinated changes → that's a feature
- It requires design decisions or scope refinement → route to `/spec-feature`
- It's part of a larger initiative the human hasn't articulated yet → ask more questions before deciding

If you're uncertain, ask one clarifying question: "Is this a self-contained fix, or is it part of something bigger?" Don't overthink it — most standalone jobs are obvious.

### Step 2: Write the Spec

Even a one-line fix needs a clear spec. Write 1-3 paragraphs describing:

- **What's wrong or what needs to change** — the current state
- **What the desired state is** — specific and concrete
- **Any constraints** — if relevant (don't pad simple fixes with boilerplate)

**Examples:**

Good: "The favicon is missing. Add a 32x32 favicon.ico to the public directory and link it in the HTML head. Use the existing logo asset scaled down."

Bad: "Fix the favicon." (Too vague — which favicon? What format? Where does it go?)

Good: "The copyright year in the footer shows 2025. Update it to 2026. The footer component is in `src/components/Footer.tsx`."

Bad: "Update the year." (Which year? Where?)

The spec should be specific enough that an implementing agent can start work immediately without asking questions.

### Step 3: Write Gherkin Acceptance Criteria

Every job — even standalone — needs at least 1 Gherkin acceptance criterion. The schema gate enforces this; a job without AC cannot enter `queued` status.

**Format:**

```gherkin
AC-1-001: {Short description}
  Given {precondition}
  When {action}
  Then {observable outcome}
```

**Quality rules (same as jobify — no exceptions for standalone):**
1. Every criterion MUST have Given, When, Then — all three required
2. "Then" MUST specify observable outcomes — status codes, visual changes, state assertions
3. No vague language — "works correctly" is rejected, be specific
4. Minimum 1 criterion (schema gate), but write 2 if there's an obvious failure case

**Use AC-1-{NUM} format** — the job sequence is always 1 for standalone jobs.

**Examples:**

Favicon fix:
```gherkin
AC-1-001: Favicon displays in browser tab
  Given a user navigates to any page of the application
  When the page fully loads
  Then the browser tab displays the company favicon (32x32 .ico)
  And no 404 error appears in the network tab for favicon.ico
```

Copyright year:
```gherkin
AC-1-001: Footer shows current year
  Given a user views any page with the footer component
  When the page renders
  Then the footer displays "© 2026" (not 2025 or any other year)
```

### Step 4: Route by Complexity

Assign complexity and model. Most standalone jobs are simple.

| Complexity | Model | When to use |
|-----------|-------|-------------|
| `simple` | `codex` | Mechanical fix, clear spec, single file, no ambiguity — **most standalone jobs** |
| `medium` | `sonnet` | Multi-file change, some judgment needed, moderate reasoning |
| `complex` | `opus` | Cross-cutting concern, architecture impact — **rare for standalone; if it's this complex, reconsider whether it's really standalone** |

Assign a role:

| Role | When to use |
|------|-------------|
| `junior-engineer` | Simple, well-defined — most standalone jobs |
| `senior-engineer` | Needs more judgment or touches sensitive code |

Assign a job type:

| Type | When to use |
|------|-------------|
| `code` | Implementation fix — most standalone jobs |
| `infra` | CI/CD, deployment, environment |
| `docs` | Documentation updates |
| `bug` | Bug fix |

### Step 5: Create the Job

Call `create_job` (or `batch_create_jobs` with a single job) with:

| Field | Value |
|-------|-------|
| `feature_id` | `null` — this is a standalone job |
| `company_id` | Current company ID |
| `spec` | The spec from Step 2 |
| `acceptance_tests` | The Gherkin AC from Step 3 |
| `role` | Assigned role from Step 4 |
| `job_type` | Assigned type from Step 4 |
| `complexity` | Assigned complexity from Step 4 |
| `model` | Routed model from Step 4 |
| `depends_on` | `[]` — standalone jobs have no dependencies |
| `status` | `queued` |

The job goes directly to `queued`. The orchestrator will dispatch it to the next available worker with the right model and slot.

### Step 6: Confirm to Human

Tell the human:

> "Created standalone job: {title}. Complexity: {complexity}, routed to {model}. It's in the queue — an agent will pick it up shortly."

Short and factual. No need for a long summary — standalone jobs are small by definition.

---

## Standalone Backlog Hygiene

Periodically (during standups or when prompted), review the standalone job backlog:

- **Are standalone jobs accumulating?** If there are more than ~10 open standalone jobs, something is wrong — either they're not being dispatched or they're not really standalone.
- **Are any "standalone" jobs actually features?** If you see a pattern of related standalone jobs (3+ touching the same area), they should have been a feature. Flag this to the human: "I've noticed several standalone fixes in the auth system — should we create a proper feature for auth cleanup?"
- **Are completed standalone jobs being reviewed?** Standalone jobs skip the CPO review loop by design. Periodically spot-check completed ones to ensure quality hasn't drifted.

This is a background responsibility, not part of the per-job flow. The routing prompt or standup skill should remind you.

---

## MCP Tools Used

| Tool | Purpose | When |
|------|---------|------|
| `create_job` / `batch_create_jobs` | Create the standalone job | Step 5 |
| `send_message` | Communicate with the human via gateway | Throughout |
| `query_projects` | Check if the task actually belongs to an existing project/feature | Step 1 (if scope is ambiguous) |

---

## Done Criteria

This skill is complete when:

- [ ] The task is confirmed as genuinely standalone (not a feature in disguise)
- [ ] `spec` is written — specific enough for an agent to start immediately
- [ ] `acceptance_tests` has at least 1 Gherkin criterion with Given/When/Then
- [ ] Complexity is routed and model is assigned
- [ ] Job is created with `feature_id: null`, `status: queued`
- [ ] Human is informed the job is queued

Unload this skill and return to the routing prompt.
