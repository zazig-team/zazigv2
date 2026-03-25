# Pipeline Technician — Implementation Card

Implement the pipeline-technician contractor role as specified in docs/plans/2026-02-25-pipeline-technician-proposal.md

This role lets the CPO commission a junior DBA to execute prescribed SQL operations (delete stale jobs, reset feature statuses, insert fresh jobs) without waiting for a human.

## Exact changes required

### 1. New edge function: supabase/functions/execute-sql/index.ts + deno.json

Create `supabase/functions/execute-sql/` directory with `index.ts` and `deno.json`.

`deno.json` — identical pattern to commission-contractor:
```json
{ "imports": { "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2" } }
```

`index.ts` — Deno edge function following the exact pattern of `supabase/functions/commission-contractor/index.ts` (same env vars, corsHeaders, jsonResponse helper, OPTIONS preflight, auth header check, try/catch). Logic:

- Accept POST body: `{ sql: string, expected_affected_rows?: number }`
- TABLE ALLOWLIST: only allow queries touching `jobs`, `features`, `agent_events`, `machines`. Parse table names from the SQL (case-insensitive regex matching FROM, INTO, UPDATE, JOIN, DELETE FROM). Reject if any table not in allowlist.
- SYNTAX BLOCKLIST: reject if SQL contains DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE (case-insensitive)
- DELETE/UPDATE SAFETY: reject DELETE or UPDATE statements that don't contain a WHERE clause
- Execute via `supabase.rpc('execute_raw_sql', { query: sql })` — the Postgres function is created in the migration below.
- Return: `{ rows: any[], affected_rows: number, warning?: string }`. Set warning if `expected_affected_rows` was provided and doesn't match `affected_rows`.

### 2. New migration: supabase/migrations/053_pipeline_technician_role.sql

This migration does THREE things:

**A. Create the `execute_raw_sql` Postgres function** (used by the execute-sql edge function):
```sql
CREATE OR REPLACE FUNCTION public.execute_raw_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  affected integer;
BEGIN
  EXECUTE query;
  GET DIAGNOSTICS affected = ROW_COUNT;
  -- Try to get rows for SELECT statements
  BEGIN
    EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
  EXCEPTION WHEN OTHERS THEN
    result = '[]'::jsonb;
  END;
  RETURN jsonb_build_object('rows', COALESCE(result, '[]'::jsonb), 'affected_rows', affected);
END;
$$;
```

**B. Insert the pipeline-technician role** following the exact pattern of `supabase/migrations/046_verification_specialist_role.sql`:

```sql
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
    'pipeline-technician',
    'Pipeline Technician — executes prescribed database operations to clear pipeline blockages',
    false,
    'claude-sonnet-4-6',
    'claude_code',
    $$## What You Do

You are the Pipeline Technician — a junior database operator who executes prescribed
SQL operations to clear pipeline blockages. You do NOT diagnose problems. You do NOT
decide what to fix. You receive a job with exact operations to perform, you execute
them, you verify the outcome, and you report back.

Think of yourself as a NOC technician following a runbook.

## What You Receive

A job spec containing:
1. A diagnosis (what's wrong and why — for context only)
2. Exact SQL operations to perform, in order
3. Expected outcome (what the state should look like after)

## What You Produce

1. Pre-flight check: SELECT to confirm target rows exist before mutating
2. Execute each prescribed operation in order using the execute_sql tool
3. Post-flight check: SELECT to verify the outcome matches expectations
4. A report at .claude/cpo-report.md with: operations executed, rows affected, final state

## How You Work

For every mutation (UPDATE, DELETE, INSERT):
1. Run a SELECT first to confirm the target rows — report what you found
2. Run the mutation — report rows affected
3. Run a SELECT after to confirm the new state — report what you see
4. If affected row count differs from what was expected, STOP and report the discrepancy

## Constraints

- ONLY execute operations explicitly listed in the job spec. Never improvise.
- Never run DELETE without a WHERE clause.
- Never modify tables outside: jobs, features, agent_events, machines.
- If the outcome doesn't match expectations, report the discrepancy — do NOT attempt a fix.
- Do not diagnose. Do not suggest improvements. Do not refactor. Execute and report.
- Always produce the report, even if operations fail.

## Report Format

```
# Pipeline Technician Report
Job ID: {uuid}
Date: {timestamp}
Result: SUCCESS | PARTIAL | FAILED

## Operations Executed
1. {operation description} — {rows affected} — {OK | MISMATCH}
2. ...

## Final State
{SELECT results confirming the current state}

## Issues
{Any discrepancies or unexpected results, or "None"}
```

## Output Contract

Every job ends with .claude/cpo-report.md.
First line: "SUCCESS: N/N operations completed" or "FAILED: operation N encountered {issue}".
Body: per-operation results with row counts and final state verification.$$,
    '{}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_persistent = EXCLUDED.is_persistent,
    default_model = EXCLUDED.default_model,
    slot_type = EXCLUDED.slot_type,
    prompt = EXCLUDED.prompt,
    skills = EXCLUDED.skills;
```

**C. Relax the feature_id constraint** to allow null feature_id for pipeline-technician:

```sql
ALTER TABLE public.jobs DROP CONSTRAINT jobs_feature_id_required;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_feature_id_required
  CHECK (
    feature_id IS NOT NULL
    OR job_type = 'persistent_agent'
    OR role IN ('project-architect', 'breakdown-specialist', 'monitoring-agent', 'pipeline-technician')
  );
```

### 3. Edit: supabase/functions/commission-contractor/index.ts

In the CONTRACTOR_ROLES array (line 44), add `"pipeline-technician"`:
```typescript
const CONTRACTOR_ROLES = ["project-architect", "monitoring-agent", "verification-specialist", "pipeline-technician"] as const;
```

In ROLE_JOB_TITLES (line 47), add:
```typescript
"pipeline-technician": "Execute prescribed pipeline operations",
```

In ROLE_JOB_TYPES (line 53), add:
```typescript
"pipeline-technician": "infra",
```

### 4. Edit: packages/local-agent/src/agent-mcp-server.ts

**A.** In the commission_contractor tool's z.enum (line 481), add `"pipeline-technician"`:
```typescript
role: z.enum(["project-architect", "monitoring-agent", "verification-specialist", "pipeline-technician"]).describe("Contractor role to commission"),
```

**B.** Add a new `execute_sql` tool BEFORE the commission_contractor tool (before line 476). Follow the exact same pattern as other tools — fetch to the edge function, return result or error:

```typescript
server.tool(
  "execute_sql",
  "Execute a scoped SQL statement against the pipeline database. Restricted to jobs, features, agent_events, machines tables. Used by pipeline-technician for prescribed operations.",
  {
    sql: z.string().describe("The SQL statement to execute"),
    expected_affected_rows: z.number().optional().describe("Expected number of affected rows — triggers warning on mismatch"),
  },
  async ({ sql, expected_affected_rows }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        content: [{ type: "text" as const, text: "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required" }],
        isError: true,
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/execute-sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ sql, expected_affected_rows }),
    });

    if (response.ok) {
      const data = await response.json();
      let text = `Rows affected: ${data.affected_rows}\nResult: ${JSON.stringify(data.rows, null, 2)}`;
      if (data.warning) text += `\n⚠️ WARNING: ${data.warning}`;
      return { content: [{ type: "text" as const, text }] };
    }

    const errorBody = await response.text().catch(() => "unknown error");
    return {
      content: [{ type: "text" as const, text: `Failed to execute SQL (HTTP ${response.status}): ${errorBody}` }],
      isError: true,
    };
  },
);
```

### 5. Edit: packages/local-agent/src/workspace.ts

In the ROLE_ALLOWED_TOOLS map (line 41), add the pipeline-technician entry:
```typescript
"pipeline-technician": ["query_features", "query_jobs", "execute_sql"],
```

## Files summary

| Action | File |
|--------|------|
| NEW | `supabase/functions/execute-sql/index.ts` |
| NEW | `supabase/functions/execute-sql/deno.json` |
| NEW | `supabase/migrations/053_pipeline_technician_role.sql` |
| EDIT | `supabase/functions/commission-contractor/index.ts` (3 additions) |
| EDIT | `packages/local-agent/src/agent-mcp-server.ts` (1 new tool + 1 enum addition) |
| EDIT | `packages/local-agent/src/workspace.ts` (1 line addition) |

## Post-implementation

1. Deploy edge functions: `supabase functions deploy execute-sql && supabase functions deploy commission-contractor`
2. Run migration: `supabase db push` or apply via Supabase dashboard
3. Rebuild local-agent: `cd packages/local-agent && npm run build`
4. Restart any active Claude Code sessions to pick up rebuilt MCP server
