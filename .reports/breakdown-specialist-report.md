status: pass
summary: Broke feature "Remove old auto-* orchestrator functions" into 1 job
jobs_created: 1
dependency_depth: 1

## Jobs

### Job 1 — Remove all 4 auto-* functions from orchestrator
- **ID**: d3eb5f7c-78dd-4d11-990c-cd8269a1e09f
- **Complexity**: medium
- **Depends on**: (none)

Covers removal of `autoTriageNewIdeas`, `autoEnrichIncompleteTriagedIdeas`, `autoSpecTriagedIdeas`, and `autoPromoteTriagedIdeas` from `supabase/functions/orchestrator/index.ts`, plus cleanup of shared helpers, imports, and company settings references that are exclusive to these functions.

## Dependency Graph

```
[d3eb5f7c] Remove all 4 auto-* functions from orchestrator
```

## Notes

All 4 functions operate in the same file and share helpers (headless expert session dispatch code). A single agent session handles the full removal to avoid dead-code inconsistencies between agents and to correctly identify which helpers are exclusively used by these functions vs. still needed elsewhere.

Safety constraints embedded in job spec:
- promote-idea invocation in the routing loop must NOT be removed
- DB columns (auto_triage, auto_triage_types, auto_spec_types, auto_promote_types) must NOT be dropped
- Expert role definitions (triage-analyst, spec-writer) must NOT be removed
- Feature pipeline code must remain untouched
