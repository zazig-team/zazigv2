# Pipeline Technician — Internal Proposal

## Problem

**Today:** When the CPO diagnoses a pipeline blockage — a stale job preventing re-breakdown, a feature stuck in the wrong status, a combiner that died mid-run — the fix is usually a known SQL operation. Delete this row, reset that status, insert a fresh job. The CPO knows exactly what to run but has no hands. Tom or Chris become the human cursor: they have to be physically at a terminal, open Supabase, and type the query the CPO already prescribed.

**Which is a problem, because:** Tom/Chris become the single point of failure for pipeline liveness. If they are at the gym, asleep, or on their phone, diagnosed problems sit unresolved for hours. The CPO session stalls. Features that could be moving stay blocked. The entire pipeline's throughput is capped by one human's availability for mechanical database operations that require zero judgement.

**What if?:** The CPO could dispatch a contractor to execute prescribed database operations immediately. Diagnosed problem at 3am? Fixed at 3am. Tom/Chris reviews the audit log over coffee instead of being the bottleneck.

## Hypothesis

Most pipeline blockages the CPO encounters have a diagnosis-to-fix gap of minutes (the CPO figures it out quickly) but a fix-to-resolution gap of hours (waiting for Tom/Chris). A contractor role with scoped database access and a strict "execute prescribed operations only" mandate would close that gap without introducing risk, because the CPO has already done the thinking — the technician just has hands.

## Therefore

Add a `pipeline-technician` contractor role that executes diagnosed, prescribed database operations on behalf of the CPO. Think of it as a junior DBA on call — they don't decide what to fix, they run the runbook.

## How this would work

### Role definition

**Name:** `pipeline-technician`

**Real-world analogy:** NOC Technician / Level 1 Database Operator. In a normal engineering company, this is the most junior ops person — the one who follows runbooks, executes prescribed commands, and escalates anything outside the playbook. They don't diagnose. They don't architect. They execute and report.

**Tools available:**
- Supabase SQL execution (scoped to the company's schema — `jobs`, `features`, `agent_events`, `machines`)
- Read access to pipeline state (same queries the CPO uses via `query_jobs`, `query_features`)
- No write access to code repositories
- No access to deploy pipelines
- No access to edge function management

**Trust level:** Execute-only. The technician receives a job with:
1. A diagnosis (what's wrong and why)
2. Exact operations to perform (SQL statements, status changes)
3. Expected outcome (what the state should look like after)

The technician runs the operations, verifies the outcome matches expectations, and reports back. If the outcome doesn't match, they report the discrepancy — they don't improvise a fix.

### Guardrails

| Rule | Rationale |
|------|-----------|
| Only execute operations explicitly listed in the job spec | Prevents scope creep into diagnosis territory |
| Never run DELETE without WHERE clause | Basic safety net |
| Never modify `companies`, `roles`, `exec_personalities`, or auth tables | Blast radius containment |
| Always SELECT before UPDATE/DELETE to confirm target rows | Verify before mutate |
| Report exact rows affected after every mutation | Audit trail |
| Escalate if affected row count ≠ expected count | Catch surprises early |

### How the CPO commissions work

The CPO already diagnoses problems and writes prescriptions in natural language (see: the stale breakdown bug in the WIP doc where the exact job IDs and operations were specified). The flow:

```
CPO diagnoses problem
  → CPO calls commission_contractor(role: "pipeline-technician")
  → Job spec contains: diagnosis, exact SQL/operations, expected outcome
  → Technician executes operations
  → Technician verifies outcome (SELECT to confirm new state)
  → Technician reports: what was done, rows affected, current state
  → CPO receives notification, continues pipeline work
```

### Example job specs (from real blockages this session)

**Job 1: Clear stale breakdown jobs**
```
Diagnosis: Feature d1c730fb has stale breakdown job (94aea3db) and
combiner job (f87b0951) from a failed first breakdown attempt.
These prevent re-breakdown.

Operations:
1. SELECT id, status, role FROM jobs WHERE id IN ('94aea3db...', 'f87b0951...');
   -- Confirm both exist and are the stale jobs
2. DELETE FROM jobs WHERE id IN ('94aea3db...', 'f87b0951...');
   -- Expected: 2 rows deleted
3. UPDATE features SET status = 'created' WHERE id = 'd1c730fb...';
   -- Expected: 1 row updated
4. UPDATE features SET status = 'ready_for_breakdown' WHERE id = 'd1c730fb...';
   -- Expected: 1 row updated

Expected outcome: Feature d1c730fb at ready_for_breakdown with zero
existing jobs. Orchestrator will create fresh breakdown job on next cycle.
```

**Job 2: Unstick a combiner**
```
Diagnosis: Feature stuck in 'combining' because combiner agent died
mid-run. No active combine job exists.

Operations:
1. SELECT id, status FROM jobs WHERE feature_id = '<id>' AND job_type = 'combine';
   -- Confirm stale combine job exists
2. DELETE FROM jobs WHERE feature_id = '<id>' AND job_type = 'combine';
   -- Remove stale combine job
3. INSERT INTO jobs (feature_id, company_id, project_id, role, job_type,
   status, complexity) VALUES ('<id>', '<company>', '<project>',
   'job-combiner', 'combine', 'queued', 'simple');
   -- Fresh combine job
4. SELECT id, status FROM jobs WHERE feature_id = '<id>' AND job_type = 'combine';
   -- Confirm new job exists and is queued

Expected outcome: Fresh combine job in queued status. Orchestrator
dispatches on next cycle.
```

### Implementation

1. **Add `pipeline-technician` to `commission_contractor` allowed roles** — single-line addition to the edge function's role whitelist
2. **Create the role prompt** — stored in `roles` table or as a contractor prompt template. Emphasises: execute prescribed operations only, verify before and after, report discrepancies, never improvise
3. **Grant SQL execution capability** — the technician's workspace needs a Supabase client or SQL execution tool. Options:
   - (a) MCP tool: `execute_sql` with table whitelist enforcement — safest, auditable
   - (b) Direct `psql` access with restricted role — more flexible, harder to audit
   - (c) Supabase Management API — middle ground
   - **Recommendation: option (a)** — a new `execute_sql` edge function that accepts SQL, validates it against an allowlist of tables, executes, and returns results. The function itself becomes the guardrail.

### The `execute_sql` edge function

```
Input: { sql: string, expected_affected_rows?: number }
Validation:
  - Parse SQL to extract table names
  - Reject if any table not in allowlist (jobs, features, agent_events, machines)
  - Reject if DELETE/UPDATE without WHERE clause
  - Reject if DROP, ALTER, TRUNCATE, or CREATE
Output: { rows: any[], affected_rows: number, warning?: string }
Warning if: affected_rows !== expected_affected_rows
```

This function is the contractor's only write tool. Everything dangerous is blocked at the function level, not by trusting the agent.

## We propose

Add a `pipeline-technician` contractor role — the pipeline's junior DBA on call. It executes prescribed database operations that the CPO has already diagnosed, verified by a new `execute_sql` edge function with table-level allowlisting. The CPO commissions work, the technician runs it, and Tom reviews the audit log instead of being the human cursor.

Three things to build:
1. `execute_sql` edge function with table allowlist (~50 lines)
2. `pipeline-technician` role prompt + add to `commission_contractor` whitelist (~20 lines)
3. MCP tool registration so the technician's workspace has access (~10 lines)
