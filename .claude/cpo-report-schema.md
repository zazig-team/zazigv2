# CPO Report: Supabase Schema Design & Setup
**Task:** zazigv2 Supabase schema design and setup
**Branch:** zazig/supabase-schema
**Date:** 2026-02-19
**Agent:** VP-Eng impl agent

---

## Summary

Designed and applied the Supabase Postgres schema for the zazigv2 orchestration server. Created all three core tables (machines, jobs, events) with correct column types, constraints, indexes, and RLS. Enabled Realtime for the jobs and machines tables. Both migrations were successfully applied to the remote Supabase project (jmussmwglgbwncgygzbz).

---

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | Core schema: machines, jobs, events tables with RLS, indexes, updated_at trigger |
| `supabase/migrations/002_enable_realtime.sql` | Enables Supabase Realtime publication for machines and jobs tables |
| `supabase/config.toml` | Supabase CLI config with project ID jmussmwglgbwncgygzbz |
| `supabase/README.md` | Manual application instructions + Realtime setup guide |

---

## Migration Status

Both migrations applied to remote Supabase project:

```
   Local | Remote | Time (UTC)
  -------|--------|------------
   001   | 001    | 001        ✓  machines, jobs, events tables + RLS + indexes
   002   | 002    | 002        ✓  ALTER PUBLICATION supabase_realtime ADD TABLE
```

**Applied via:** Supabase CLI (`supabase db push`), required working from /tmp due to macOS filesystem deadlock on the repo's `supabase/.temp/` directory after a background db dump command.

---

## Schema Implemented

### machines
- id, name (UNIQUE), slots_claude_code, slots_codex, hosts_cpo, last_heartbeat, status CHECK ('online'|'offline'), created_at
- RLS enabled, service_role full-access policy

### jobs
- id, card_id, card_type CHECK (code|infra|design|research|docs), complexity CHECK (simple|medium|complex), slot_type CHECK (claude_code|codex), machine_id FK→machines, status CHECK (queued|dispatched|executing|reviewing|complete|failed), context, result, pr_url, started_at, completed_at, created_at, updated_at
- updated_at trigger (auto-updates on row change)
- Indexes: idx_jobs_status, idx_jobs_machine_id
- RLS enabled, service_role full-access policy

### events
- id, event_type, card_id, machine_id FK→machines, detail (jsonb), created_at
- Indexes: idx_events_card_id, idx_events_created_at
- RLS enabled, service_role full-access policy

---

## Realtime

Migration 002 added machines and jobs tables to the `supabase_realtime` publication. This enables local agent daemons to subscribe to job dispatches and status changes via websocket without polling.

---

## Issues Encountered

1. **Initial config.toml format** -- First attempt used incorrect keys (`api.project_id`, `realtime.tables`). Fixed by generating a reference config from `supabase init` and rewriting to match CLI 2.54.11 schema.

2. **macOS APFS compressed file deadlock (SF_RESTRICTED)** -- A background `supabase db dump` command set the `SF_RESTRICTED` + `UF_APPEND` flags on ALL files in the `.git/` directory (errno 11 EDEADLOCK). This makes git completely non-functional from this directory — every read attempt fails. The migration pushes were completed from `/tmp/zazigv2-fresh/` instead. The schema files on disk are fine (only .git internals are locked). **Git commit requires human to fix the .git directory — see Manual Steps.**

3. **SUPABASE_SERVICE_ROLE_KEY not in Doppler** -- The service role key is not yet stored in Doppler (zazig project, prd config). Manual steps below cover this.

---

## Manual Steps Required (BLOCKING)

### CRITICAL: Fix the .git directory filesystem lock
The entire `.git/` directory has `SF_RESTRICTED` flags set on all files (macOS APFS compression deadlock from the `supabase db dump` command). Git is non-functional until this is cleared.

**Fix requires one of:**

Option A: Run in a terminal with sudo access:
```bash
sudo chflags -R 0 ~/Documents/GitHub/zazigv2/.git
# Then commit the supabase/ directory files
cd ~/Documents/GitHub/zazigv2
git checkout zazig/supabase-schema
git add supabase/
git add .claude/cpo-report-schema.md
git commit -m "feat: add Supabase schema migrations and config for zazigv2 orchestrator"
git push -u origin zazig/supabase-schema
```

Option B: Reboot the machine (clears APFS filesystem locks), then run the git add/commit/push above.

### 2. Store service role key in Doppler
```bash
# Get from Supabase dashboard: Settings > API > service_role key
doppler secrets set SUPABASE_SERVICE_ROLE_KEY=<value>
```

### 3. Clear the locked .temp directory
```bash
rm -rf ~/Documents/GitHub/zazigv2/supabase/.temp
supabase link --project-ref jmussmwglgbwncgygzbz
```

### 4. Verify schema in Supabase dashboard
https://supabase.com/dashboard/project/jmussmwglgbwncgygzbz/editor

Run to verify:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Should show: machines, jobs, events

SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Should show: machines, jobs
```
