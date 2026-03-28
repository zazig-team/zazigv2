status: pass
summary: Broke feature "Serialise feature-to-master merge jobs per project" into 2 jobs
jobs_created: 2
dependency_depth: 1

## Jobs

### Job 1 — Add merge serialisation gate to dispatchQueuedJobs
- ID: ea0ac9a5-6019-4d44-a6d4-19a02208bc50
- complexity: medium
- depends_on: []
- File: supabase/functions/orchestrator/index.ts
- Insert a merge gate block after the DAG check (~line 821) and before model/slot resolution (~line 823). One Supabase query + one conditional + one continue. No other files change.

### Job 2 — Add orchestrator tests for merge serialisation gate
- ID: ad04befb-1b20-45f0-a61f-44186bcd6a62
- complexity: medium
- depends_on: [ea0ac9a5-6019-4d44-a6d4-19a02208bc50]
- File: supabase/functions/orchestrator/orchestrator.test.ts
- Four Deno.test cases: (1) gate blocks same-project in-flight merge, (2) gate allows when no merge in-flight, (3) gate does not block different-project merge, (4) gate skipped for non-merge job types.

## Dependency Graph

```
ea0ac9a5 (impl)
    └── ad04befb (tests)
```

## Notes

- Feature scope is a single file change: one Supabase query added to the enrichment loop.
- Retry context: previous attempt produced no changes (likely too vague). Specs now include exact line range, surrounding code context, and the complete gate block to insert.
- Mock constraint noted in test job spec: createSmartMockSupabase does not support double .eq().eq() chains — test job directed to use .in() or test the conditional logic directly.
