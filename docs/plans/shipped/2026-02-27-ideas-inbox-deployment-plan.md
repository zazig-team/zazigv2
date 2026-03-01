# Ideas Inbox Deployment Plan

## Status
- Migration: DONE (ideas table live in Supabase, 31 columns, indexes, RLS, event types)
- Edge functions: NOT DEPLOYED
- MCP wrappers: NOT DEPLOYED

## Context

The pipeline built all 7 jobs successfully on feature branch `origin/feature/ideas-inbox-table-edge-functions-mc-ea21ee02`. The branch is stale (diverged from master before migrations 055-065). Full merge would conflict. But the 5 edge function commits are clean — each only creates a new directory under `supabase/functions/`. The MCP wrappers commit modifies `agent-mcp-server.ts` which has changed on master.

## Step 1: Cherry-pick edge functions onto master

From the zazigv2 repo root:

```bash
cd ~/Documents/GitHub/zazigv2
git checkout master
git pull origin master

# Cherry-pick the 5 edge function commits (order doesn't matter — independent directories)
git cherry-pick 020651e  # create-idea
git cherry-pick bec3ccd  # query-ideas
git cherry-pick 9084ad3  # update-idea
git cherry-pick 209eb2c  # promote-idea
git cherry-pick 7529fca  # batch-create-ideas

git push origin master
```

Each commit only touches its own `supabase/functions/{name}/deno.json` and `index.ts`. Zero overlap with master. Should apply cleanly.

CI/CD autodeploy (GitHub Action from commit `c3c6396`) will detect changes in `supabase/functions/` and deploy them automatically.

## Step 2: Verify edge functions are live

After push, check GitHub Actions ran. Then test one endpoint:

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/query-ideas \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "new"}'
```

Should return `{"ideas": []}` (empty table, no ideas yet).

## Step 3: MCP wrappers (manual merge)

Commit `d36d4bd` adds 5 MCP tool definitions to `packages/local-agent/src/agent-mcp-server.ts`. This file has changed on master since the branch point, so cherry-pick will conflict.

Options (pick one):
- **A) Manual apply:** View the diff (`git show d36d4bd`), find the 5 tool registration blocks, and manually add them to the current `agent-mcp-server.ts`. This is additive — just new tool definitions, no modifications to existing code.
- **B) Ask Chris:** He's been modifying this file. May be faster for him to apply.
- **C) Pipeline job:** Create a single-job feature to add the MCP wrappers. Overkill but stays in pipeline.

Recommendation: Option A. The MCP wrappers are additive (5 new tool registrations). View the diff, copy the tool blocks, paste into the current file.

To view what needs adding:
```bash
git show d36d4bd -- packages/local-agent/src/agent-mcp-server.ts
```

## Step 4: Add ideas tools to CPO's MCP access list

The CPO role needs `create_idea`, `query_ideas`, `update_idea`, `promote_idea`, `batch_create_ideas` in its `mcp_tools` array in the `roles` table. Run in Supabase SQL Editor:

```sql
UPDATE roles
SET mcp_tools = array_cat(mcp_tools, ARRAY[
  'create_idea', 'query_ideas', 'update_idea', 'promote_idea', 'batch_create_ideas'
])
WHERE name = 'cpo';
```

(Verify column name — may be `role` instead of `name`. Check with `SELECT * FROM roles WHERE name = 'cpo' OR role = 'cpo';`)

## Step 5: Restart CPO session

MCP server process caches tool definitions for the session lifetime. After step 3-4, restart the CPO Claude Code session to pick up the new tools.

## Step 6: Smoke test

From the CPO session, try:
```
Create a test idea: "Test idea from CPO — verifying ideas pipeline Phase 1"
```

If the `create_idea` MCP tool works and returns an idea ID, Phase 1 is fully operational.

## Step 7: Clean up stale branch

Once everything is verified working:
```bash
git push origin --delete feature/ideas-inbox-table-edge-functions-mc-ea21ee02
```

## What this unblocks

- Phase 2: Ideaify Skill & CPO Triage Integration (38a1d16e)
- Phase 4: Idea Visualiser (33f9e3c1)
- query-idea-status edge function + MCP tool (3c6b11f8)
- CPO inbox sweep behaviour (drive-pipeline skill)

## Migration file

The migration was run manually, not via the migration file on the branch. For the migration history to be clean, add the file to master:

```bash
git show origin/feature/ideas-inbox-table-edge-functions-mc-ea21ee02:supabase/migrations/054_ideas_inbox.sql > supabase/migrations/054_ideas_inbox.sql
git add supabase/migrations/054_ideas_inbox.sql
git commit -m "feat(db): add ideas inbox migration file (already applied to Supabase)"
```

This ensures the migration exists in the repo even though it was applied manually.
