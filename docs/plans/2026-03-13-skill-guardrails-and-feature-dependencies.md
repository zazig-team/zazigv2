# Skill Guardrails & Feature-Level Dependencies

**Date:** 2026-03-13
**Status:** Approved
**Author:** CPO
**Reviewed by:** Codex (GPT-5.4) — second opinion incorporated
**Triggered by:** Auto-spec Phase A failure — migration specs caused all jobs to fail

---

## Problem

### 1. Specs allow impossible acceptance criteria

The spec-feature and jobify skills have no guidance about what engineer agents can and cannot do. Engineers execute in isolated git worktrees — they write files and run local tests. They cannot deploy, apply migrations, or connect to live databases.

The CPO wrote Phase A auto-spec specs with acceptance criteria like:
- "Migration applies cleanly. `UPDATE expert_sessions SET status = 'failed'` succeeds"
- "Columns exist. `SELECT auto_spec FROM companies` returns values"

The breakdown specialist faithfully passed these through into job ACs. The first engineer agent correctly identified it couldn't meet the criteria and reported failure. This cascaded: killed Phase A/B/C, caused a full restructure into Feature 1 + 2, costing hours of pipeline time.

**Root cause:** Neither skill defines the agent capability boundary.

### 2. No feature-level dependency enforcement

Complex work (auto-spec) required migrations shipped BEFORE code features could merge. The code references DB columns (`auto_spec`, `spec_url`) that only exist after migrations run. Without feature-level dependency, the CPO had to manually sequence: create Feature 1 (migrations), wait for ship, then create Feature 2 (code).

The featurify skill already describes `depends_on_features` in its template, but:
- The column doesn't exist on the features table
- The orchestrator doesn't enforce it
- The scrum skill already treats unmet dependencies as a manual block (line 88)

---

## Changes

### Change 1: spec-feature.md — Agent Capability Boundary

**Location:** After the "Quality check before proceeding" block (~line 104), add a new subsection.

```markdown
### Agent Capability Boundary

Engineer agents execute jobs in isolated git worktrees. They can ONLY:
- Write and modify files (code, migrations, configs, tests)
- Run local tests, linters, and type checks
- Read the existing codebase

They CANNOT:
- Deploy, apply migrations, or connect to live/staging databases
- Call external APIs, Supabase Management API, or cloud services
- Verify state in running environments

**All specs must describe file-level deliverables.** Acceptance criteria must be
verifiable by inspecting files and running local tests — never by checking live
system state.

Bad: "Migration applies cleanly. UPDATE succeeds. Columns exist in DB."
Good: "Migration file exists with correct SQL syntax. ALTER TABLE adds the
specified columns with correct types and defaults."

Deployment, migration application, and environment verification are human/CI
steps — capture those in the human_checklist, not in acceptance_tests.
```

### Change 2: jobify.md — AC Validation Rule + Migration Template

**Location A:** Add rule 9 to the "Quality rules" list (~after line 97).

```markdown
9. **No live-system verification** — Every AC must be verifiable in a git worktree
   using only local files and local test commands. Reject any criterion that requires
   connecting to a database, calling an API, deploying code, or checking state in a
   running environment. If the spec contains such criteria, rewrite them as file-level
   checks before creating jobs.
```

**Location B:** Add a new section after the "Quality Checklist" (~after line 221).

```markdown
---

## Migration Job Template

When a job's deliverable is a SQL migration file, use this AC template instead of
improvising. Migration jobs verify the file, not the applied state.

```gherkin
AC-{SEQ}-001: Migration file exists at expected path
  Given the spec requires a migration for {description}
  When the job completes
  Then supabase/migrations/{number}_{name}.sql exists in the repo

AC-{SEQ}-002: SQL contains the specified schema change
  Given the migration file exists
  When the file contents are inspected
  Then it contains {expected DDL/DML — e.g. ALTER TABLE, CREATE INDEX, INSERT INTO}

AC-{SEQ}-003: No destructive operations without explicit spec approval
  Given the migration file exists
  When the file contents are inspected
  Then it does not contain DROP TABLE, TRUNCATE, or DELETE without WHERE clause
    unless the spec explicitly requires destructive operations
```

Adapt criteria to the specific migration. Add criteria for data migrations,
constraint changes, or RLS policies as needed. Never add criteria that require
the migration to be applied to a live database.
```

### Change 3: Feature-level depends_on (separate feature)

This requires DB + orchestrator changes — not a skill text edit. Promote existing
idea `97a4801e` to a feature.

**Required implementation:**
1. Migration: `ALTER TABLE features ADD COLUMN depends_on UUID[] DEFAULT '{}'`
2. Orchestrator: Don't transition dependent features past `created` until all
   `depends_on` features reach `complete` status
3. Cycle detection: Reject circular dependencies at creation time
4. WebUI: Show blocked status and reason on dependent feature cards
5. featurify + spec-feature: Accept `depends_on` in feature creation calls

**Gate behaviour:**
- Features with unmet dependencies stay at `created`
- Spec work and breakdown can proceed (allows parallel prep)
- Implementation dispatch (job queuing) is blocked until dependencies complete
- When a dependency completes, orchestrator re-evaluates blocked features on next tick

---

## Deferred (noted, not building)

Per Codex review, these are worth doing later but not now:

- **Creation-time linting** — Validator that rejects unsafe phrases in specs/ACs
  ("apply migration", "UPDATE succeeds", "live DB"). Good idea, engineering work.
- **Ephemeral DB verification** — Orchestrator runs migrations against a disposable
  DB in CI. Right long-term, complex to build.
- **Expand-contract discipline** — For destructive schema changes (renames/drops),
  enforce 3-feature sequence: additive change → code tolerates both → cleanup.
  We rarely do destructive changes yet; note it, don't build for it.
- **Engineer prompt injection** — Executor injects capability boundary into every
  job prompt. CTO-domain work.

---

## Implementation Prompt

The skill text changes (Changes 1 and 2) should be made by editing the files
directly in the zazigv2 repo:

- `projects/skills/spec-feature.md`
- `projects/skills/jobify.md`

Change 3 (feature depends_on) should go through the normal pipeline as a feature.
