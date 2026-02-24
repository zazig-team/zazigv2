STATUS: COMPLETE
CARD: 699d19fa
BRANCH: cpo/pai-migration
FILES: supabase/migrations/038_cpo_role_prompt.sql (new)
TESTS: SQL validated programmatically (dollar-quoting, structure, all sections present)
NOTES: Moved CPO messaging instructions + MCP tool docs into roles.prompt via migration 038.

---

# CPO Report — Migration 038: CPO Role Prompt Update

## Summary
Created migration 038 that UPDATEs the CPO's `roles.prompt` to include messaging instructions and MCP tool documentation, previously hardcoded in the executor's `CPO_MESSAGING_INSTRUCTIONS` constant.

## Changes

### 1. Migration 038_cpo_role_prompt.sql (new)
UPDATEs `public.roles` WHERE `name = 'cpo'` with the full assembled prompt:

- **Existing responsibilities** — carried forward verbatim from migration 012 (What You Do, What You Don't Do, Hard Stops, Output Contract, When You Receive a Job)
- **Messaging instructions** — moved from `CPO_MESSAGING_INSTRUCTIONS` in `packages/local-agent/src/executor.ts:54-94` (inbound message format, conversation_id routing, send_message usage)
- **MCP tool documentation** — `send_message`, `create_feature`, `update_feature`, `query_projects` with full parameter docs and status constraints
- **Feature workflow** — 5-step workflow for handling user build requests

## What's Next
- The executor's `CPO_MESSAGING_INSTRUCTIONS` constant (executor.ts:54-94) can be removed once the orchestrator reads from the DB
- PR ready for review at `cpo/pai-migration`

## Token Usage
- Budget: claude-ok (direct implementation)
- Single SQL migration file, no TypeScript changes
- Validated SQL structure programmatically
