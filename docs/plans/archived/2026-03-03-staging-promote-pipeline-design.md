# Staging + Promote Pipeline Design

**Date:** 2026-03-03
**Status:** Approved
**Authors:** Chris Evans, Claude

## Problem

zazigv2 uses itself to build itself. Three attack surfaces cause production breakage daily:

1. **Local agent code** — merged changes break the executor, workspace, or connection code
2. **Database migrations** — schema/data changes break running agents, edge functions, and the dashboard
3. **Edge functions** — deployed functions go out of sync with the DB or local agent

All three hit one shared production environment with no staging layer. When something breaks, the pipeline needed to fix it is itself broken.

## Solution

A staging environment + promote gate, configured per-project via `zazig.environments.yaml`.

### Core Principle

**Master is staging.** Everything merges to master freely. CI auto-deploys to a staging environment. Production is decoupled — only updated by an explicit `zazig promote` command.

## Feature Pipeline

Per-feature, fully automated:

```
created → breaking_down → building → combining_and_pr → verifying → merged
              ↑                                             |
              |______________ fix requested ________________|
```

| Status | What happens |
|---|---|
| `created` | Feature exists with spec |
| `breaking_down` | Orchestrator creates breakdown job if missing, feature is decomposed into jobs |
| `building` | Code jobs are dispatched and executed |
| `combining_and_pr` | Job branches merged together, PR created |
| `verifying` | PR is reviewed. Pass → merge to master. Fail → back to `building` via fix request |
| `merged` | Terminal state. Feature is on master. Feature pipeline complete. |

### Failure handling

| Stage | Failure | Action |
|---|---|---|
| `building` | Job fails | Stays `building`, retry/fix job |
| `combining_and_pr` | Merge conflict | Back to `building` (request_feature_fix) |
| `verifying` | Review fails | Back to `building` (request_feature_fix) |

## Project Pipeline

Per-project, triggered by merges to master:

```
PR merged → CI deploys to Staging (auto) → Test → zazig promote → Production
```

This is **not** per-feature. If three features merge in an hour, staging gets all three. You test once, promote once.

### Deployment tracking

A new `deployments` table records each deployment event:

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `company_id` | uuid | FK to companies |
| `git_sha` | text | Commit SHA deployed |
| `environment` | text | `staging` or `production` |
| `status` | text | `deployed_to_staging`, `testing`, `fix_required`, `promoted` |
| `features_included` | uuid[] | Feature IDs merged since last promotion |
| `promoted_by` | text | Who ran `zazig promote` |
| `created_at` | timestamptz | When deployed |
| `promoted_at` | timestamptz | When promoted to production (null until promoted) |

## Three Paths to Production

| Path | When | Flow |
|---|---|---|
| **Feature pipeline** | New features, multi-job work | Breakdown → Build → Combine+PR → Verify+Merge → Staging → Test → Promote |
| **Hotfix** | Small fixes found during testing | `zazig hotfix` → commit to master → CI deploys to staging → test → promote |
| **Manual** | Pipeline is broken, emergency | Direct CLI: `supabase functions deploy`, `supabase db push`, etc. |

## Infrastructure

### Two Supabase projects

| Project | Purpose | Cost |
|---|---|---|
| `zazigv2-staging` | Staging DB + edge functions | $25/month |
| `zazigv2` (existing) | Production — only updated by `zazig promote` | Existing |

### Two CLI binaries

| Binary | Points at | Runs from | Purpose |
|---|---|---|---|
| `zazig` | Production Supabase | Pinned build (`~/.zazigv2/builds/current/`) | Real work |
| `zazig-staging` | Staging Supabase | Git repo (`dist/`) | Testing new code |

Both you and Tom run both. Your production pipeline keeps running while you test changes on staging.

### Doppler configs

- `zazig/prd` — production keys (existing, unchanged)
- `zazig/staging` — staging Supabase URL, anon key, service role key (new)

## Environment Configuration

### `zazig.environments.yaml`

Per-project config file in the repo root. Defines how to deploy to each environment. Built incrementally — agents add entries when they provision infrastructure.

**If absent:** pipeline just does code → PR → merge. No staging, no promote. Degrades gracefully.

```yaml
# Example: zazigv2 (Supabase + local agent)
name: zazigv2
environments:
  staging:
    deploy:
      provider: supabase
      project_ref: <staging-project-ref>
      edge_functions: true
      migrations: true
    agent:
      source: repo
      doppler_config: staging
  production:
    deploy:
      provider: supabase
      project_ref: jmussmwglgbwncgygzbz
      edge_functions: true
      migrations: true
    agent:
      source: pinned
      doppler_config: prd
    promote_from: staging
```

```yaml
# Example: Next.js website
name: acme-website
environments:
  staging:
    deploy:
      provider: vercel
      project_id: prj_staging123
    healthcheck:
      path: /api/health
      timeout: 30
  production:
    deploy:
      provider: vercel
      project_id: prj_prod456
    promote_from: staging
```

```yaml
# Example: iOS app
name: fitness-app
environments:
  staging:
    deploy:
      provider: custom
      script: "./scripts/deploy-testflight.sh"
  production:
    deploy:
      provider: custom
      script: "./scripts/deploy-app-store.sh"
    promote_from: staging
```

### When config gets created

Agents add environment entries when they provision infrastructure. When an agent sets up Supabase for a project, it adds the Supabase deploy entry. When it sets up Vercel, it adds the Vercel entry. The config grows organically as the project evolves.

## CI Pipeline

### On every PR

- `npm run build` — must compile
- `npm run test` — unit tests must pass
- **Block merge if either fails**

### On every merge to master

1. `npm run build` + `npm run test` (catch merge-conflict regressions)
2. Deploy changed edge functions to **staging**
3. Run `supabase db push` against **staging**
4. Record deployment in `deployments` table

Production is never touched by CI.

## Promote Flow

`zazig promote` — single command, reads `zazig.environments.yaml`:

### Steps (sequential, stops on failure)

1. **Safety checks**
   - Must be on master, up to date with origin
   - Must have clean build (`npm run build` passes)
   - Warns if there are unapplied migrations

2. **Push migrations to production DB**
   - `supabase db push --project-ref <prod-ref>`

3. **Deploy edge functions to production**
   - `supabase functions deploy <changed> --project-ref <prod-ref>`

4. **Pin local agent build**
   - Copies `packages/local-agent/dist/`, `packages/shared/dist/`, `node_modules/` to `~/.zazigv2/builds/current/`
   - Records git SHA in `~/.zazigv2/builds/current/.version`
   - Moves previous build to `~/.zazigv2/builds/previous/`

5. **Record in DB**
   - Insert `deployments` row with status `promoted`

### Rollback

`zazig promote --rollback`:
- Swaps `current/` and `previous/` build directories
- Restarts production agent on the old build
- Does NOT rollback migrations or edge functions (fix forward)

## Staging Fix Agent

`zazig staging-fix` — interactive on-demand agent for fixing issues found during testing.

### What it is

An interactive Claude session pre-loaded with staging context. You describe the issue, it fixes it, commits to master, CI redeploys to staging.

### What it has access to

- Staging Supabase credentials (read DB state, test queries)
- Ability to deploy edge functions to staging
- Ability to push migrations to staging
- Git access to commit to master
- The project's `environments.yaml`
- Recent CI/deploy logs

### Flow

```
Find bug on staging
  → zazig staging-fix
    → Interactive session opens
    → You describe the issue
    → Agent fixes + commits to master
    → CI redeploys to staging
    → You verify
    → Close session
```

### When to use each fix path

| Severity | Path |
|---|---|
| Small (typo, config, minor bug) | `zazig staging-fix` or `zazig hotfix` |
| Large (logic error, architecture) | Back through the feature pipeline |

## Testing

### Today (v1 — human)

- You test staging manually via `zazig-staging`
- You decide: hotfix or pipeline fix
- You run `zazig staging-fix` or tell the CPO to create a fix

### Tomorrow (v2 — automated)

- Automated smoke tests run after CI deploys to staging
- Tests report pass/fail
- On fail: auto-creates issue, pipeline picks it up
- On pass: staging marked ready to promote

## Summary

The design creates a clear boundary between development and production:

- **Master is staging** — merge freely, break staging, never break production
- **Production is explicit** — only updated by `zazig promote`
- **Per-project config** — `zazig.environments.yaml` makes this work for any project, not just zazigv2
- **Three fix paths** — feature pipeline, hotfix, manual escape hatch
- **Incremental adoption** — no config = no staging. Config grows as infrastructure grows.
