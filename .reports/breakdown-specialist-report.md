status: pass
summary: Broke "CLI: show job errors and feature diagnostics" into 4 jobs covering UUID fix, error field extension, features list enrichment, and new feature-errors command
jobs_created: 4
dependency_depth: 3

## Jobs

1. **Fix zazig jobs UUID validation regex** (simple)
   - ID: 7d240132-59b1-4534-ac0d-cf18470d9ee4
   - depends_on: []
   - Fix UUID_V4ISH_REGEX in jobs.ts to accept all valid UUID formats, not just v4

2. **Extend query-jobs edge function with error fields and company listing** (medium)
   - ID: d9e746f2-9a2a-4ba4-a174-f74e7c10ff47
   - depends_on: [7d240132-59b1-4534-ac0d-cf18470d9ee4]
   - Add error_message, error_details, timestamps, idea_id to JOB_SELECT; support company-level listing

3. **Add error summary fields to zazig features list output** (medium)
   - ID: 7c3a0202-f7d1-461f-8e27-92b9e13d47e0
   - depends_on: []
   - Add failed_job_count, critical_error_count, health indicator to query-features and CLI output

4. **Implement zazig feature-errors diagnostic command** (complex)
   - ID: ee2be626-e5aa-4026-aed5-a0a2e297b7c0
   - depends_on: [d9e746f2-9a2a-4ba4-a174-f74e7c10ff47]
   - New command showing human-readable feature diagnostics: job summary, failed jobs, stuck jobs, recommendations

## Dependency Graph

```
[1: Fix UUID regex] ──► [2: Extend query-jobs] ──► [4: feature-errors command]
[3: Features error summary] (independent, runs in parallel with 2)
```

Max dependency chain: 3 (jobs 1 → 2 → 4)
