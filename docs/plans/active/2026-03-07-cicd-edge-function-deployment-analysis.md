# CI/CD Edge Function Deployment — Full Analysis

**Date:** 2026-03-07
**Status:** Active bug — production edge functions lose `--no-verify-jwt` on every promote

## The Problem

Every time `zazig promote` runs, the dashboard breaks with `401 Invalid JWT` errors. This has happened at least 3 times (Mar 5, Mar 7 morning, Mar 7 evening). Each time requires manual redeployment of all edge functions with `--no-verify-jwt`.

## Root Cause

There are **3 workflow files** and **2 deployment paths**, and they contradict each other.

### Workflow Files

| File | Trigger | What it does |
|------|---------|-------------|
| `ci.yml` | PR to master | Build + test only. No deploy. |
| `deploy-edge-functions.yml` | Push to master | Staging pipeline: build → migrations → mirror repo → sync prod data → deploy edge functions to **STAGING** |
| `deploy-production.yml` | Push to production | Production pipeline: build → migrations → deploy edge functions to **PRODUCTION** |

### Bug 1: Production deploy does NOT include `--no-verify-jwt`

`deploy-production.yml` line 58:
```yaml
supabase functions deploy "$fn" --project-ref "$SUPABASE_PRODUCTION_PROJECT_REF"
```

No `--no-verify-jwt` flag. Every production deploy resets all functions to `verify_jwt=true`.

The staging workflow (`deploy-edge-functions.yml` line 112) correctly has `--no-verify-jwt`. But the production workflow doesn't. **Our pipeline fix (feature `48310510`) only fixed the staging workflow** because that's where the `HEAD~1` bug was — the production workflow was a separate file that the junior-engineer never touched.

### Bug 2: Staging deploy is blocked by data sync failure

The staging workflow has a strict dependency chain:
```
build-and-test → push-staging-migrations → mirror-repo → sync-prod-data → deploy-edge-functions
```

`sync-prod-data` currently fails because staging's `jobs` table is missing a `raw_log` column that production has. When it fails, `deploy-edge-functions` is **skipped entirely**. These are independent concerns — edge function deployment has nothing to do with data sync.

### Bug 3: `zazig promote` triggers production deploy without `--no-verify-jwt`

The promote flow:
1. `zazig promote` pushes to the `production` branch
2. GitHub Actions triggers `deploy-production.yml`
3. That workflow deploys ALL edge functions to production **without `--no-verify-jwt`**
4. Dashboard immediately breaks

This happens on every promote. The production workflow has been deploying without `--no-verify-jwt` since it was created.

## Why the fix we shipped today didn't help

Feature `48310510` ("Fix CI/CD autodeploy") was fast-tracked through the pipeline. The junior-engineer modified `deploy-edge-functions.yml` — the **staging** workflow. It correctly added `${{ github.event.before }}` diff range and `--no-verify-jwt`.

But:
- The staging workflow was already blocked by Bug 2 (sync failure → deploy skipped)
- The production workflow (`deploy-production.yml`) was never modified
- Production is what matters for the dashboard

So: correct fix, wrong file. And even the right file was blocked from running.

## The Full Fix (3 changes needed)

### Fix A: Add `--no-verify-jwt` to production workflow
`deploy-production.yml` line 58 — add `--no-verify-jwt`:
```yaml
supabase functions deploy "$fn" --project-ref "$SUPABASE_PRODUCTION_PROJECT_REF" --no-verify-jwt
```
This is the one-line fix that stops the recurring break.

### Fix B: Remove data sync dependency from staging edge function deploy
`deploy-edge-functions.yml` line 76 — change:
```yaml
needs: sync-prod-data
```
to:
```yaml
needs: push-staging-migrations
```
Edge function deploy doesn't need data sync. They're independent.

### Fix C: Fix staging data sync (separate issue)
The `sync-prod-to-staging.sh` script tries to insert a `raw_log` column that doesn't exist on staging. Either:
- Add the missing migration to staging, or
- Make the sync script column-aware (only sync columns that exist on both sides)

This is lower priority — the sync failing doesn't break anything user-facing.

## Timeline of the Recurring Break

| When | What happened | How it was fixed |
|------|--------------|-----------------|
| Mar 5 | First occurrence after staging/prod split | Manual redeploy with `--no-verify-jwt` |
| Mar 7 AM | Recurred after a promote | Manual redeploy |
| Mar 7 PM (1) | Recurred after pipeline merges triggered staging CI | Manual redeploy |
| Mar 7 PM (2) | Recurred again ~1 hour later after another promote | Manual redeploy |

## Shipping Options

The fix needs to land on the `production` branch, because that's what triggers `deploy-production.yml`. Two ways to get it there:

### Option 1: Commit to master → `zazig promote`

1. Commit Fix A + Fix B to master
2. Run `zazig promote`
3. Promote copies master → production branch, triggering the workflow

**Downside:** The promote itself pushes to the production branch, which triggers the workflow. If the workflow runs before the new code lands (race condition unlikely but possible), you get one more JWT break. In practice the window is ~2 minutes and the new workflow wins. But there's a brief period where the old (broken) workflow definition might be what runs.

**Upside:** Normal flow. Everything goes through master first.

### Option 2: Cherry-pick directly to production branch (recommended)

1. Commit Fix A + Fix B to master (for the record)
2. Cherry-pick the same commit directly to the `production` branch
3. The push to production triggers the now-fixed workflow immediately
4. Every future promote inherits the fix from master

**Why this is better:**
- Zero-blip. The fixed workflow is what runs from the very first trigger.
- No race condition. The workflow definition is already correct when it fires.
- Future promotes are clean — master has the fix, so promote copies the fixed file.
- One-time manual step that permanently closes the loop.

**Steps:**
```bash
# 1. On master, commit both fixes
git checkout master
# Edit deploy-production.yml line 58: add --no-verify-jwt
# Edit deploy-edge-functions.yml line 76: change needs to push-staging-migrations
git add .github/workflows/deploy-production.yml .github/workflows/deploy-edge-functions.yml
git commit -m "fix: add --no-verify-jwt to production deploy, unblock staging deploy from sync"

# 2. Cherry-pick to production
git checkout production
git cherry-pick master
git push origin production

# 3. Back to master
git checkout master
```

## Recommendation

**Option 2.** Cherry-pick to production. Zero risk, permanent fix, 60 seconds of work.

Fix C (staging data sync `raw_log` column mismatch) can wait — it's staging-only with no user impact. Track separately.
