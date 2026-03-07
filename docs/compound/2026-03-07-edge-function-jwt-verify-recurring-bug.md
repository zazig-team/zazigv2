# Edge Function JWT verify_jwt Bug (Recurring)

**Date:** 2026-03-07 (second occurrence; first was 2026-03-05)
**Severity:** P0 — breaks entire dashboard
**Time to fix:** 2 minutes (once you know the pattern)
**Time wasted first time:** Hours

---

## Problem

Dashboard shows all zeros. Every column empty. Error visible on screen:
```
get-pipeline-snapshot failed (401): {"code":401,"message":"Invalid JWT"}
query-ideas: Edge Function returned a non-2xx status code — {}
```

Console shows dozens of 401 errors from `query-goals`, `query-focus-areas`, `get-pipeline-snapshot`, `query-ideas`.

## Root Cause

Supabase edge functions have a `verify_jwt` setting (default: `true`). When `true`, the Supabase gateway validates the JWT **before** the function code runs. Our functions do their own auth handling internally, so gateway-level JWT verification is unnecessary and actively harmful — the gateway rejects tokens that our functions would accept.

## Why It Recurs

The CI/CD autodeploy workflow (`.github/workflows/deploy-edge-functions.yml`) deploys functions without the `--no-verify-jwt` flag. Every automated deploy resets all deployed functions to `verify_jwt=true`. Manual deploys with `--no-verify-jwt` fix it, but only until the next CI deploy.

## Diagnosis

Check function settings via Supabase Management API:
```bash
SUPABASE_ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN --project zazig --config prd --plain)
curl -s "https://api.supabase.com/v1/projects/jmussmwglgbwncgygzbz/functions" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | \
  python3 -c "import json,sys; [print(f'{f[\"name\"]}: verify_jwt={f[\"verify_jwt\"]}') for f in json.load(sys.stdin)]"
```

If any function shows `verify_jwt=True`, that's the bug.

## Fix (Immediate)

```bash
cd ~/Documents/GitHub/zazigv2
npx supabase functions deploy get-pipeline-snapshot query-ideas query-goals query-focus-areas \
  --no-verify-jwt --project-ref jmussmwglgbwncgygzbz
```

Reload the dashboard. All data should appear immediately.

## Fix (Permanent)

Feature `3486da81` — Fix CI/CD autodeploy. The workflow needs `--no-verify-jwt` added to its deploy command. This feature has failed in the pipeline but has a complete spec ready for re-run.

Alternative: add `verify_jwt = false` to each function's `config.toml` file so the setting is version-controlled and survives any deploy method.

## Affected Functions (Known)

All edge functions called by the web UI:
- `get-pipeline-snapshot`
- `query-ideas`
- `query-goals`
- `query-focus-areas`

Likely all other edge functions too — any function deployed via CI without `--no-verify-jwt` will have this problem.

## Timeline

| Date | Event | Time to fix |
|------|-------|-------------|
| 2026-03-05 | First occurrence. Hours debugging — assumed token expired/stale. Eventually found `verify_jwt=true` via Management API. | Hours |
| 2026-03-07 | Second occurrence. Recognized pattern immediately from napkin. Checked API, confirmed, redeployed. | 2 minutes |

## Key Lesson

When Supabase edge functions return 401 "Invalid JWT" and the token is freshly issued (e.g. Playwright fresh session), the problem is almost certainly `verify_jwt=true` on the function, not the token itself. Check the function config before debugging token generation.
