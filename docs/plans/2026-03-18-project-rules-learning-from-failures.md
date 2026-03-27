# Project Rules: Automated Learning from CI Failures

## Context

Migration numbering collision in PR #289 revealed a systemic gap: agent branches diverge from master and repeat mistakes the pipeline has already encountered. The migration collision is Supabase-specific, but the class of problem is universal — every project has its own landmines that agents discover by failing.

## Problem

The pipeline has no memory across features. When an agent hits a project-specific problem (migration numbering, import conventions, config quirks), it fixes it for that feature but the next feature hits the same problem. There's no mechanism to capture "lessons learned" and inject them into future agents.

## Solution

A closed learning loop: when a fix agent repairs a CI failure, it can create a **project rule** — a plain-language instruction stored in the DB and automatically injected into future agents' context for that project. The pipeline teaches itself.

```
CI fails → fix agent analyses + fixes → fix agent creates rule → future agents receive rule → problem doesn't recur
```

## Design

### 1. Data Model

New table: `project_rules`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, default gen_random_uuid() |
| `project_id` | uuid | FK → projects, NOT NULL |
| `rule_text` | text | Plain-language rule injected into agent prompts, NOT NULL |
| `applies_to` | text[] | Job types: `["code", "combine", "test"]` etc, NOT NULL |
| `source_job_id` | uuid | FK → jobs, nullable. The job that created this rule |
| `created_at` | timestamptz | default now() |

RLS: scoped to company via project join. Standard pattern.

No expiry columns, no hit counters. Manual cleanup only.

### 2. Edge Function: create-project-rule

New edge function at `supabase/functions/create-project-rule/`.

**Input:**
```json
{
  "project_id": "uuid",
  "rule_text": "Always check the highest existing migration number on master before naming new migrations. Run: ls supabase/migrations/ | tail -5",
  "applies_to": ["code", "combine"]
}
```

**Behaviour:**
- Validates `project_id` exists and belongs to the caller's company
- `source_job_id` extracted from the job context header (same pattern as other job-aware edge functions)
- Inserts into `project_rules`
- Returns `{ rule_id: "uuid" }`

**Validation:**
- `rule_text` required, non-empty
- `applies_to` required, non-empty array, values must be valid job types
- `project_id` must exist and belong to the caller's company

### 3. MCP Tool: create_project_rule

Exposed to all pipeline agents — engineers, combiners, test-engineers, fix agents. Any agent that spots a preventable pattern can create a rule.

MCP tool definition follows the same pattern as existing tools: calls the `create-project-rule` edge function with company context header.

### 4. Rule Injection at Dispatch

When the orchestrator creates a job, it queries `project_rules` for matching rules and appends them to the job context.

**Query:**
```sql
SELECT rule_text FROM project_rules
WHERE project_id = $1
AND $2 = ANY(applies_to)
ORDER BY created_at
```

Where `$2` is the job's `job_type`.

**Injection into job context:**
```json
{
  "type": "code",
  "featureId": "...",
  "spec": "...",
  "project_rules": [
    "Always check the highest existing migration number on master...",
    "Never import from @supabase/supabase-js in edge functions..."
  ]
}
```

Rules are self-explanatory instructions. A one-line addition to engineer/combiner role prompts ensures they're followed: "If your job context includes project_rules, follow them."

### 5. Fix Agent Prompt Change

The fix agent prompt (used by `request-feature-fix`) gets one addition:

> After fixing the issue, consider whether this failure was caused by a preventable pattern — something that any future agent working on this project should know. If so, call `create_project_rule` with a clear, actionable rule and the job types it applies to. Only create a rule if the pattern is general enough to recur. Don't create rules for one-off bugs.

No structured output format. No report parsing. The agent uses judgment.

## What's NOT in Scope

- Rule expiry, TTL, or hit counters — manual cleanup only
- Rule editing/deletion UI — direct DB for now
- Rule deduplication — duplicate rules may coexist
- Seeding rules upfront — the system starts empty and learns
- Rule quality validation — trusted to agent judgment

## Files Affected

- `supabase/migrations/` — new migration: `project_rules` table + RLS
- `supabase/functions/create-project-rule/` — new edge function
- `supabase/functions/orchestrator/index.ts` — rule query + injection at job dispatch
- MCP server config — add `create_project_rule` tool definition
- Role prompt migrations — one-line additions to engineer, combiner, fix agent prompts

## Risks

| Risk | Mitigation |
|------|------------|
| Fix agent creates bad/noisy rules | Prompt instructs "only general patterns, not one-off bugs." Can prune manually. |
| Rules accumulate and bloat context | Manual cleanup for now. Monitor rule count per project. |
| Duplicate rules from similar failures | Accepted. Low cost — extra context lines, not broken behaviour. |
| Agent ignores project_rules in context | Role prompt explicitly says to follow them. Same compliance as any other instruction. |
