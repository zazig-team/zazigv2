# Auto-deploy Edge Functions on Merge to Main

## Problem

Commits to `supabase/functions/` land on master but require a manual `supabase functions deploy` to go live. This has caused two pipeline stalls (branch generation, routing ReferenceError) where fixes were committed but not deployed.

## Recommendation: GitHub Action

Add a workflow triggered on push to `main` that deploys only changed edge functions.

```yaml
on:
  push:
    branches: [main, master]
    paths: ['supabase/functions/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          changed=$(git diff --name-only HEAD~1 HEAD -- supabase/functions/ | cut -d/ -f3 | sort -u | grep -v _shared)
          for fn in $changed; do
            supabase functions deploy "$fn" --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
          done
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

## Effort

~30 min. Add the workflow file + two GitHub secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`). Both values already exist in Doppler.

## Tradeoff

- **Pro:** Zero-friction deploys, eliminates "committed but not deployed" class of bugs entirely.
- **Con:** Any broken edge function on master goes live immediately. Mitigated by: edge functions are stateless, rollback is a revert + re-deploy, and we don't have a staging environment anyway.

## Alternatives Considered

- **Post-commit hook:** Local-only, doesn't work for other contributors or CI.
- **`zazig deploy` CLI command:** More work to build, same manual invocation problem.
