status: pass
summary: Broke feature CLI unified zazig search into 2 jobs (edge function + CLI command)
jobs_created: 2
dependency_depth: 2
failure_reason:

## Jobs

1. **Create query-search edge function** (complex)
   - Job ID: c00568f2-f503-42cf-ad9f-c839567c2308
   - depends_on: []
   - Implements supabase/functions/query-search/index.ts with multi-table ilike search, type/status filters, per-entity pagination, ilike injection sanitization, CORS, auth, company isolation

2. **Create CLI search command and register it** (medium)
   - Job ID: 14a27ec4-baef-48fa-9f84-b22ed7d2858b
   - depends_on: [c00568f2-f503-42cf-ad9f-c839567c2308]
   - Implements packages/cli/src/commands/search.ts and registers it in the CLI router

## Dependency Graph

```
c00568f2 (query-search edge function)
    └── 14a27ec4 (CLI search command)
```

## Notes

- Pagination is per-entity (not global), matching spec requirement
- Type filter is comma-separated (e.g. idea,job) matching spec
- ilike sanitization (escape % and _) is in scope for the edge function job
- Existing --search flags on other commands are explicitly not touched
