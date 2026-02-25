# CPO Report — Task 1: persistent_agents table

**STATUS: COMPLETE**

## Summary

Created `supabase/migrations/048_persistent_agents.sql` with:

- `persistent_agents` table: one row per (company, role, machine)
- Columns: id, company_id, role, machine_id, status (running/stopped/error), prompt_stack, last_heartbeat, created_at
- Foreign keys to `companies` and `machines` with CASCADE deletes
- UNIQUE constraint on (company_id, role, machine_id)
- RLS enabled with policy allowing users to manage their own company's agents via `user_companies`

## Branch

`cpo/tfc-migration` — pushed to origin.

## Token Usage

Single-file SQL migration. No subagents or codex delegation needed. Minimal token usage.
