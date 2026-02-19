# Supabase Setup -- zazigv2

Project: **zazig** orchestration server
Project ID: `jmussmwglgbwncgygzbz`
Region: East US (North Virginia)

---

## Applying the Migration

### Option A: Supabase CLI (preferred)

```bash
# 1. Make sure you're logged in
supabase projects list

# 2. Link to the zazig project
supabase link --project-ref jmussmwglgbwncgygzbz

# 3. Push the migration to the remote project
supabase db push
```

The migration files are in `supabase/migrations/`:
- `001_initial_schema.sql` -- core tables (machines, jobs, events)
- `002_enable_realtime.sql` -- enables Realtime publication

### Option B: Manual -- Supabase Dashboard SQL Editor

If the CLI is unavailable or not linked:

1. Go to https://supabase.com/dashboard/project/jmussmwglgbwncgygzbz/editor
2. Click the SQL Editor tab
3. Paste the contents of `supabase/migrations/001_initial_schema.sql` and click **Run**
4. Then paste `supabase/migrations/002_enable_realtime.sql` and click **Run**

Verify that three tables were created: `machines`, `jobs`, `events`.

---

## Enabling Realtime

Realtime must be enabled on `jobs` and `machines` tables so local agents receive dispatch events over websockets.

Migration `002_enable_realtime.sql` handles this automatically. If applying manually:

### Via the Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/jmussmwglgbwncgygzbz/database/replication
2. Under **Supabase Realtime**, click **0 tables** (or the current table count)
3. Toggle ON `machines` and `jobs`
4. Click **Save**

### Via SQL (alternative)

Run in the SQL editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE machines;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
```

---

## Schema Overview

| Table | Purpose |
|-------|---------|
| `machines` | Registry of local agent machines -- slots, heartbeat, CPO host flag |
| `jobs` | Job queue -- one row per card dispatched by the orchestrator |
| `events` | Append-only event log -- lifecycle and status events |

All tables have RLS enabled. Local agents and the orchestrator authenticate using the **service role key**, which bypasses RLS. Anon access is blocked.

---

## Environment Variables

The service role key is stored in Doppler. Do NOT commit it to the repo.

```bash
# Retrieve the service role key
doppler run -- printenv SUPABASE_SERVICE_ROLE_KEY
# or
doppler secrets get SUPABASE_SERVICE_ROLE_KEY --plain
```

The anon key is safe to commit and is embedded in client-side code:

```
SUPABASE_URL=https://jmussmwglgbwncgygzbz.supabase.co
SUPABASE_ANON_KEY=sb_publishable_DfCpGJaqxT-TspGwYo0n_g_oJVgUTxz
```

---

## Connecting to the Project

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // use service role for local agent / orchestrator
)
```

For local agents subscribing to Realtime:

```typescript
const channel = supabase
  .channel('jobs-dispatch')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'jobs',
      filter: `machine_id=eq.${MY_MACHINE_ID}`
    },
    (payload) => handleDispatch(payload.new)
  )
  .subscribe()
```
