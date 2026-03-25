# Auto-Spec E2E: Expert Session Lifecycle Bugs

**Date:** 2026-03-13
**Tags:** auto-spec, expert sessions, "expert_sessions_status_check", CAS claim, poll endpoint, service_role JWT, "Forbidden", session lifecycle, agent-inbound-poll, agent-event, start-expert-session, expert-session-manager, "completed_at", project_id, repo_url

## Problem

The auto-spec orchestration chain (spec-writer → spec-reviewer → revise/approve) was not working end-to-end on staging. Seven distinct bugs prevented the chain from completing without manual DB intervention.

Symptoms observed:
- Expert sessions stuck at "running" in DB after the tmux process exited
- Poll endpoint returning expert sessions without repo context (no `project_id`, `repo_url`, `branch`)
- Daemon receiving 403 Forbidden from `agent-event` and `agent-inbound-poll` edge functions
- CAS claim update (`requested → claimed`) failing silently with constraint violation
- Orchestrator unable to detect session completion and dispatch next step

## Context

The auto-spec feature chains headless expert sessions: a spec-writer creates a spec, then a spec-reviewer validates it and routes to `approve`, `revise`, or `workshop`. The orchestrator watches for completed sessions and dispatches the next step. Two delivery paths exist: Realtime broadcast (primary) and poll-based fallback (agent-inbound-poll).

Staging uses legacy JWT service_role tokens (not the newer `sb_secret_` format). The daemon authenticates to edge functions using this JWT.

## Investigation

Ran E2E testing on staging (Staging Test Co, `5b6787db`). Triggered auto-spec on idea `75c15bca` and traced the chain through 5 expert sessions across ~2 hours, fixing bugs as they surfaced.

### Bug 1: Sessions never marked "completed" in DB

`expert-session-manager.ts:handleSessionExit()` cleaned up the tmux session, injected summary into CPO, pushed commits, and removed the worktree — but never called `updateSessionStatus(sessionId, "completed")`. The orchestrator polls for completed sessions to dispatch the next step, so this was a chain-breaker.

### Bug 2: Missing "claimed" status in DB constraint

The `expert_sessions_status_check` constraint only allowed: `requested, starting, running, completed, cancelled, failed`. The poll endpoint's CAS pattern updates `requested → claimed` to prevent double-delivery. This update failed silently because "claimed" wasn't in the constraint. Sessions picked up via poll were never actually claimed, leading to potential double-delivery or stuck states.

### Bug 3: Poll endpoint missing repo context

Expert sessions delivered via Realtime broadcast include `project_id`, `repo_url`, and `branch` in the payload (set by `start-expert-session`). But the poll fallback path in `agent-inbound-poll` didn't include these fields — it only selected basic session fields and the expert role. Experts started via poll had no repo to work in.

### Bug 4: `project_id` not stored in expert_sessions table

The `expert_sessions` table had no `project_id` column. Even after fixing the poll endpoint's select query, there was no FK to join against `projects` for the `repo_url`. Required a new column + migration.

### Bug 5: `agent-event` auth rejected service_role JWT

The `agent-event` edge function only accepted user tokens via `supabaseAdmin.auth.getUser(token)`. The staging daemon authenticates with a service_role JWT, which isn't a user token. Every event report (heartbeat, status update) got 403'd.

### Bug 6: `agent-inbound-poll` auth same JWT issue

The poll endpoint had `authenticateRequest()` that checked for direct string match against `SUPABASE_SERVICE_ROLE_KEY`. Staging injects a different format key at runtime (`sb_secret_` vs the JWT in config), so the direct match failed. Needed JWT payload parsing as fallback.

### Bug 7: `connection.ts` auth token fallback

The daemon's `sendToOrchestrator()` and poll methods fell back to `this.supabaseAnonKey` when no user session existed (always the case for the daemon). The service_role key was available in config but never used as a fallback.

## Solution

### Bug 1 fix: `packages/local-agent/src/expert-session-manager.ts`

Added `await this.updateSessionStatus(session.sessionId, "completed")` as the first call in `handleSessionExit()`. Also added `completed_at` timestamp setting in `updateSessionStatus()` when status is "completed".

### Bug 2 fix: `supabase/migrations/160_expert_sessions_claimed_status.sql`

```sql
ALTER TABLE expert_sessions DROP CONSTRAINT IF EXISTS expert_sessions_status_check;
ALTER TABLE expert_sessions ADD CONSTRAINT expert_sessions_status_check
  CHECK (status IN ('requested', 'claimed', 'starting', 'running', 'completed', 'cancelled', 'failed'));
```

### Bug 3 fix: `supabase/functions/agent-inbound-poll/index.ts`

Updated the expert sessions select query to include `project_id` and join `projects(repo_url)`. Updated the message builder to conditionally include `project_id`, `repo_url`, and `branch` in the start_expert payload.

### Bug 4 fix: `supabase/migrations/161_expert_sessions_project_id.sql`

```sql
ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
```

Also updated `start-expert-session/index.ts` to store `project_id: resolvedProjectId` in the insert.

### Bug 5 fix: `supabase/functions/agent-event/index.ts`

Added service_role JWT detection before falling through to `getUser()`:

```typescript
let isServiceRole = false;
try {
  const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
  if (payload.role === "service_role") isServiceRole = true;
} catch { /* not a JWT */ }
```

### Bug 6 fix: `supabase/functions/agent-inbound-poll/index.ts`

Added JWT payload parsing in `authenticateRequest()` after the direct string match:

```typescript
try {
  const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
  if (payload.role === "service_role") return true;
} catch { /* not a JWT — fall through */ }
```

### Bug 7 fix: `packages/local-agent/src/connection.ts`

Changed token fallback chain from `session?.access_token ?? this.supabaseAnonKey` to `session?.access_token ?? this.serviceRoleKey ?? this.supabaseAnonKey`.

## Decision Rationale

- **JWT payload parsing over direct key comparison:** Staging and production inject different key formats. Parsing the JWT payload for `role: "service_role"` works regardless of the key format. This matches the pattern already used in `agent-inbound-poll` for the direct match case.

- **`project_id` column on expert_sessions:** The alternative was to always look up the project from the expert role or batch context, but storing it directly is simpler and makes the poll endpoint's join straightforward. It also future-proofs for cases where sessions may reference different projects.

- **CAS claim pattern kept:** The `requested → claimed` CAS update is the right pattern to prevent double-delivery between Realtime and poll paths. The fix was adding "claimed" to the constraint, not removing the CAS pattern.

## Prevention

1. **E2E testing before merge:** The auto-spec orchestrator was merged without E2E testing. All seven bugs would have been caught by a single end-to-end run on staging.

2. **Auth integration test:** Edge functions should be tested with the actual token format the daemon uses, not just user tokens. A simple curl test with the service_role JWT would have caught bugs 5-7.

3. **Session lifecycle test:** A test that starts an expert session, lets it complete, and verifies the DB status would have caught bug 1.

4. **Migration + constraint review:** When adding CAS patterns that introduce new status values, the DB constraint must be updated in the same PR. Bug 2 was a classic "code assumes a status the schema doesn't allow" issue.

5. **Never edit .mjs files directly:** During this E2E session, the compiled .mjs bundles were accidentally modified as a shortcut to hot-patch the running daemon. The proper path for staging is: edit `.ts` → `npm run build` → restart daemon (uses `dist/index.js`). The .mjs files are build artifacts produced by `zazig promote`.
