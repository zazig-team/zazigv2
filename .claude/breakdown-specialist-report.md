status: pass
summary: Broke feature fc6ac52a into 4 jobs covering edge function update, CLI command, MCP removal, and prompt layer docs
jobs_created: 4
dependency_depth: 3

## Jobs

1. **Edge function: add limit/offset to query-jobs** (simple)
   - ID: c4c89a9d-5354-4a67-a35c-f9129a2af614
   - depends_on: []
   - File: supabase/functions/query-jobs/index.ts

2. **CLI: create zazig jobs command** (medium)
   - ID: 805cccaf-4339-47a2-ae73-6f9a42f4b6ec
   - depends_on: [c4c89a9d-5354-4a67-a35c-f9129a2af614]
   - Files: packages/cli/src/commands/jobs.ts (new), packages/cli/src/index.ts

3. **Remove query_jobs from MCP server and DB roles** (simple)
   - ID: 52cee19e-d10c-41b3-bb35-178304388b80
   - depends_on: []
   - Files: supabase/migrations/XXX_remove_query_jobs_mcp.sql (new), packages/local-agent/src/agent-mcp-server.ts

4. **Prompt layer: document zazig jobs in UNIVERSAL_PROMPT_LAYER** (simple)
   - ID: 383a3962-41d1-45da-ada1-d71b6282e9a5
   - depends_on: [805cccaf-4339-47a2-ae73-6f9a42f4b6ec]
   - File: supabase/functions/_shared/prompt-layers.ts

## Dependency Graph

Jobs 1 and 3 run in parallel. Job 2 follows job 1. Job 4 follows job 2.
Max chain: 1 -> 2 -> 4 (depth 3)
