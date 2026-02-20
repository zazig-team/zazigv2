# P0 RLS Security Fix

## Summary

Fixed 2 P0 and 2 P1 security issues identified in code review of PR #12.

## P0-1: Cross-tenant data exposure (CRITICAL) — FIXED

**Problem:** `004_rls_direct_writes.sql` used `USING (true)` on anon-role policies for
both `machines` and `jobs` tables. Any holder of the public anon key could read/write
ALL companies' data with no tenant scoping.

**Fix:** Removed all anon-role RLS policies. DB writes now use the `service_role` key
(which bypasses RLS entirely — security is via key secrecy). The anon key is used only
for Realtime channel subscriptions (read-only).

Changes:
- `004_rls_direct_writes.sql`: Replaced 4 broad anon policies with a no-op + documentation
- `config.ts`: Added `service_role_key?: string` to `SupabaseConfig`, loaded from `SUPABASE_SERVICE_ROLE_KEY` env var
- `connection.ts`: Created separate `dbClient` using service_role key for all DB writes; anon client (`supabase`) used only for Realtime

## P0-2: Unrestricted column UPDATE — FIXED

**Problem:** Anon UPDATE policy had no column restriction.

**Fix:** Moot — anon policies removed entirely. service_role bypasses RLS.

## P1: Heartbeat write unscoped — FIXED

**Problem:** `connection.ts` heartbeat used `.eq('name', machineId)` with no company_id
scope. With service_role (which bypasses RLS), this could update machines across tenants
if names collide.

**Fix:** Added `company_id` to `MachineConfig` (loaded from `machine.yaml`). Heartbeat
write now scopes: `.eq('company_id', companyId).eq('name', machineId)`.

## P1: sendJobFailed missing error detail — FIXED

**Problem:** `executor.ts` `sendJobFailed` DB write only set `status: "failed"` without
persisting the error message.

**Fix:** Added `result: \`FAILED: ${error}\`` to the update payload.

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/004_rls_direct_writes.sql` | Removed 4 anon policies, replaced with documentation |
| `packages/local-agent/src/config.ts` | Added `service_role_key`, `company_id` to types + loader |
| `packages/local-agent/src/connection.ts` | Added `dbClient` (service_role), scoped heartbeat by company_id |
| `packages/local-agent/src/executor.ts` | Added `result` field to sendJobFailed DB write |
| `packages/local-agent/src/index.ts` | Pass `conn.dbClient` to JobExecutor instead of `conn.supabase` |

## machine.yaml Changes Required

After this fix, `~/.zazigv2/machine.yaml` must include a `company_id` field:

```yaml
name: my-machine
company_id: "<uuid-of-your-company>"
slots:
  claude_code: 2
  codex: 1
```

And the `SUPABASE_SERVICE_ROLE_KEY` environment variable must be set.

## Token Usage

Direct implementation by Claude — no codex delegation needed. Straightforward security fix.
