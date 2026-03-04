# Staging & Production: Two-Lane Workflow

**Date:** 2026-03-04
**Source:** Chris/Tom meeting + follow-up CPO session
**Status:** Active — this is how zazig works now

---

## The Setup

Two completely separate environments. Production only changes when explicitly promoted.

| | Production | Staging |
|---|---|---|
| **Command** | `zazig start` | `zazig-staging start` |
| **Code source** | Bundled `.mjs` in `releases/` | Live tsc output from working tree (`dist/staging-index.js`) |
| **Database** | Production Supabase | Staging Supabase (separate instance) |
| **Edge functions** | Production Supabase | Staging Supabase |
| **Updates when** | You run `zazig promote` | Automatically on every push to master |

## What `zazig promote` Does

Copies three things from staging to production:

1. **Edge functions** — deployed to production Supabase
2. **Migrations** — schema changes applied to production Supabase
3. **Local agent bundle** — compiled into `releases/zazig.mjs` (the frozen production binary)

**Does NOT copy:** Row data (roles table, companies, features, jobs, etc.). Each Supabase instance owns its own data.

## What GitHub Actions Does on Push to Master

Automatically:
1. Build and test
2. Deploy edge functions to staging Supabase
3. Push migrations to staging Supabase

This means master = staging. Every merge updates staging immediately.

## The Orchestrator Cron Cycle

Runs every minute, internal loop every 10 seconds. Each cycle does three things:

1. If a feature has a status and the job for that status is **complete** → move feature to next status
2. If a feature has a status and **no job exists** for that status → create and queue the job
3. If there are **queued jobs** and a **machine available** → dispatch to that machine

To reset something: put the feature at the right status without a job, or queue a new job at that status.

## Pipeline Flow (Simplified)

```
ready_for_breakdown → breaking_down → building → combine_and_pr → verifying → merging → complete
```

- **breaking_down:** Creates the individual code jobs
- **building:** Code jobs execute (can be many in parallel)
- **combine_and_pr:** Merges all job branches, creates GitHub PR
- **verifying:** Runs tests against the combined code
- **merging:** Merges PR into master (which auto-updates staging)
- **complete:** Done

## Daily Workflow

### Normal work (90% of the time)
Run `zazig start` — production. Stable version. Push features through the pipeline. They merge to master and update staging, but production is untouched.

### Testing changes
Run `zazig-staging start` with a test company on the staging database. Verify new features, MCP tools, daemon changes actually work.

### Promoting
When staging is solid: `zazig promote` → restart `zazig start`. Production now has the new stuff.

### Cadence
- **Small safe changes** (new MCP tool, config tweak): test once on staging, promote immediately. 10-minute cycle.
- **Big structural changes** (daemon rewrite, orchestrator logic): batch up, test thoroughly on staging, then promote.

## Important Implications

### New MCP tools/features
Only available on staging until promoted. Production CPO can't use them yet. Don't reference capabilities that only exist on staging.

### Daemon changes
Same — staging daemon runs new code, production daemon runs the promoted version. No more "pull latest, restart, pray."

### Database row data (roles, prompts, etc.)
Each Supabase instance has its own data. Updating the CPO prompt in production Supabase is safe — promote won't overwrite it. Update production directly for prompt/config changes.

### If you kill the local agent mid-job
Heartbeat timeout is 2 minutes. The orchestrator will re-queue the job after that.

## Web UI (Unresolved)

The Netlify-deployed web UI is NOT yet covered by this split. Currently points at production Supabase only.

**Options (simplest first):**
1. **Local dev against staging** — run `npm run dev` with staging Supabase credentials when testing UI changes
2. **Netlify branch deploys** — push to a `staging` branch for a preview URL configured with staging env vars
3. **Environment toggle in UI** — like Chris's dashboard has (dropdown to switch Supabase target)

Recommendation: Option 1 for now, option 2 when it gets annoying.

## Setup (From Chris's Slack)

To get both commands on your PATH:

1. Clone/pull the repo
2. `npm install` at repo root (installs workspace deps)
3. `npm run build` (compiles TypeScript)
4. `npm link` in `packages/cli/` (or `npm install -g .` from there) — puts both `zazig` and `zazig-staging` on PATH

- `zazig` (production) uses the bundled `.mjs` — self-contained after promote
- `zazig-staging` uses `dist/staging-index.js` — depends on tsc output and `node_modules` in working tree

## Future: Automated Staging Tests

Chris's vision: on every push to master, automatically run a test suite on staging — create a company from scratch, push 5 features through the pipeline, verify they all complete correctly. Like Uber's fake island that always had rides running. Could be an agent whose sole job is continuous staging verification.

## Monitoring Logs

- Job logs: `~/.zazigv2/job-logs/{jobId}-pipe-pane.log`
- Daemon log: `~/.zazigv2/local-agent-00000000.log`
- VS Code extension "Explorer Sort Order" — sort by time to see latest job logs first
- Claude sessions show the result in the bottom section of the log
- Codex sessions are harder to follow — different logging format
