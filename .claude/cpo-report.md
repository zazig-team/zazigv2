# CPO as Persistent Job — Implementation Report

## Summary

Converted CPO from a special system (hardcoded `hosts_cpo` flag on machines) to a regular persistent job dispatched by the orchestrator. Persistent jobs auto-requeue on completion or failure, giving automatic failover if the host goes offline.

## What Was Done

1. **Removed CPO-specific config fields**:
   - Removed `cpoAlive: boolean` from `Heartbeat` message interface
   - Removed `hostsCpo: boolean` from `Machine` interface
   - Removed `hosts_cpo: boolean` from `MachineConfig` interface
   - Removed `CPO_FAILOVER_THRESHOLD_MS` constant (no longer needed)
   - Updated heartbeat construction and validators

2. **Added role to StartJob message**:
   - Added optional `role?: string` field to `StartJob` interface
   - Updated validators to accept optional role
   - Orchestrator includes `role` when dispatching role-based jobs

3. **Added JobType and updated Job interface**:
   - Added `JobType` union type matching DB `job_type` column
   - Added `jobType` and `role` fields to `Job` interface

4. **Orchestrator persistent job handling**:
   - `handleJobComplete`: checks `job_type === 'persistent_agent'`, re-queues instead of completing
   - `handleJobFailed`: persistent jobs always re-queue regardless of failure reason

5. **Seed migration (005)**:
   - Trigger function `create_persistent_job_on_role_enable()` auto-creates persistent jobs when a company enables a persistent role
   - Seeds a dev company with CPO and CTO persistent roles enabled

## Files Changed

- `packages/shared/src/messages.ts` — removed `cpoAlive`, added `role` to `StartJob`
- `packages/shared/src/index.ts` — removed `hostsCpo`, `CPO_FAILOVER_THRESHOLD_MS`, added `JobType`, updated `Job`
- `packages/shared/src/validators.ts` — removed `cpoAlive` check, added `role` validation
- `packages/local-agent/src/config.ts` — removed `hosts_cpo` from `MachineConfig`
- `packages/local-agent/src/connection.ts` — removed `cpoAlive` from heartbeat
- `packages/local-agent/src/index.ts` — removed `hostsCpo` from log
- `packages/orchestrator/src/index.ts` — removed `CPO_FAILOVER_THRESHOLD_MS` re-export
- `supabase/functions/orchestrator/index.ts` — persistent job auto-requeue logic, role in StartJob
- `supabase/functions/_shared/messages.ts` — mirror of shared changes for Deno
- `supabase/migrations/005_persistent_jobs_seed.sql` — **new** seed migration

## Migration Number

**005** — `005_persistent_jobs_seed.sql`

Note: PR #12 has 004_rls_direct_writes.sql, PR #13 has 004_add_model_to_jobs.sql (collision between those two). This migration uses 005 to avoid conflicts.

## Pre-merge Check

All checks passed (lint + tsc --noEmit).

## Token Usage

Token budget: claude-ok (direct implementation, no codex delegation needed).
