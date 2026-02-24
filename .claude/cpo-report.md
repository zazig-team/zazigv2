# CPO Report -- commission_contractor

## Summary

Built the `commission_contractor` tool -- the mechanism for the CPO to dispatch ephemeral contractor agents (Project Architect, Breakdown Specialist, Monitoring Agent) by creating queued jobs. Includes a database migration, Supabase edge function, MCP tool, and workspace permission update.

## Agent Team Summary

- **Team composition**: 2 general-purpose agents (cloud-agent, local-agent) + 1 code-reviewer
- **Contract chain**: Pre-defined API contract -- both agents worked in parallel since the edge function request/response shape was fully specified upfront
- **Files per teammate**:
  - cloud-agent: `supabase/migrations/044_relax_feature_id_contractor.sql`, `supabase/functions/commission-contractor/index.ts`, `supabase/functions/commission-contractor/deno.json`
  - local-agent: `packages/local-agent/src/agent-mcp-server.ts`, `packages/local-agent/src/workspace.ts`
- **Agent Teams value assessment**: Parallel execution saved time -- both agents completed independently without coordination overhead. The pre-defined contract meant no upstream/downstream dependency. Total wall-clock time was dominated by the slower agent (cloud-agent with 3 files) rather than the sum of both.

## Code Review

Integration check by team lead verified:
- Edge function follows existing patterns (batch-create-jobs, batch-create-features)
- Validation rules correct: breakdown-specialist requires feature_id, project-architect rejects it
- Uses `context` column (not `spec`) for job description
- Event type `contractor_commissioned` fires correctly
- MCP tool request/response matches edge function contract
- CPO workspace includes `commission_contractor` in allowed tools

## Changes

| File | Change |
|------|--------|
| `supabase/migrations/044_relax_feature_id_contractor.sql` | New -- relaxes constraint for contractor roles |
| `supabase/functions/commission-contractor/index.ts` | New -- edge function with validation, job insert, event |
| `supabase/functions/commission-contractor/deno.json` | New -- Deno import map |
| `packages/local-agent/src/agent-mcp-server.ts` | Edit -- added `commission_contractor` tool |
| `packages/local-agent/src/workspace.ts` | Edit -- added `commission_contractor` to CPO allowed tools |

## Testing

Manual testing required post-merge:
1. Deploy migration 044 via Management API
2. Deploy edge function: `SUPABASE_ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN --project zazig --config prd --plain) npx supabase functions deploy commission-contractor --no-verify-jwt --project-ref jmussmwglgbwncgygzbz`
3. Test each contractor role via MCP tool or direct edge function call

## Decisions Made

- Contractor roles hardcoded in both constraint and edge function (not table-driven) -- matches the existing pattern for job_type validation
- Role lookup against `roles` table ensures only provisioned roles can be commissioned
- `medium` complexity for all contractors -- they need Claude Code, not Codex
- Event type `contractor_commissioned` (not reusing `job_created`) for clear audit trail
