# Capabilities Seeded Under Wrong Company — RLS Red Herring

**Date:** 2026-03-08
**Tags:** Supabase, RLS, "No capabilities found", PostgreSQL, `LIMIT 1`, seed migration, `user_in_company`, Playwright, capabilities, roadmap, row-level security

## Problem

The Roadmap page showed "No capabilities found" after deploying 32 capabilities via seed migration. The data existed in the database (verified via service role key), but authenticated users saw 0 rows. Every RLS policy variation we tried — `user_in_company(company_id)`, inline subqueries, even `company_id = '00000000-...'::uuid` — returned empty. Only `USING (true)` worked.

## Context

Three bugs compounded:

1. **CTE Snapshot Isolation** (migration 122): The seed migration inserted capability lanes AND capabilities in the same `WITH` statement. The `all_lanes` CTE couldn't see rows from `inserted_lanes` because data-modifying CTEs share the same snapshot. Lanes inserted but capabilities didn't.

2. **Remediation migration** (124) fixed the CTE bug, but used `SELECT id FROM public.companies LIMIT 1` to get the company — same pattern as the original.

3. **`LIMIT 1` without `ORDER BY`**: On production, `LIMIT 1` returned "Test Co" (`171406d7-9cba-40ca-b74c-2b38b4712de5`) instead of "zazig-dev" (`00000000-0000-0000-0000-000000000001`). All 32 capabilities were seeded under the wrong company.

4. **Migration renaming pitfall**: While debugging, we renamed migration 123→125 to fix a numbering collision. Supabase tracks applied migrations by filename in `schema_migrations`. The rename broke `supabase db push` on staging ("remote migration versions not found locally"). Had to align filenames to match what staging's history expected.

## Investigation

Hours spent debugging RLS policies:
- Verified `user_in_company` function exists, is `SECURITY DEFINER`, returns `true` via RPC
- Verified `auth.uid()` returns correct user ID
- Verified `user_companies` table has correct entries
- Verified table-level GRANTs (`SELECT` on `authenticated`)
- Tested `USING (true)` — worked (32 rows)
- Tested `USING (user_in_company(company_id))` — 0 rows
- Tested `USING (company_id = '00000000-...'::uuid)` — 0 rows
- Tested `USING (company_id IS NOT NULL)` — worked (32 rows)

The breakthrough: `company_id IS NOT NULL` returning data while `company_id = '00000000-...'::uuid` returned nothing meant the `company_id` values weren't what we assumed. A `SELECT DISTINCT company_id FROM capabilities` revealed `171406d7-...` — a completely different company.

**Playwright browser testing was essential** for reproducing the exact authenticated user experience. The Management API runs as superuser (bypasses RLS), so SQL console tests were unreliable for RLS debugging.

## Solution

```sql
-- Fix the data: move capabilities to correct company
UPDATE public.capabilities
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id = '171406d7-9cba-40ca-b74c-2b38b4712de5'::uuid;

UPDATE public.capability_lanes
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id = '171406d7-9cba-40ca-b74c-2b38b4712de5'::uuid;
```

RLS policies were actually correct (`user_in_company(company_id)`) — no policy changes needed.

## Decision Rationale

- **Fix data, not policies**: The RLS was working correctly. Changing policies to work around bad data would have been the wrong fix.
- **Created migration 127**: Safety net to correct `company_id` via the migration pathway, even though the data was already fixed via Management API.
- **Kept `user_in_company` function**: Same pattern as all other tables. Consistent approach.

## Prevention

1. **Never use `LIMIT 1` without `WHERE` or `ORDER BY`** in seed migrations. Use `WHERE name = 'zazig-dev'` or `WHERE id = '00000000-...'` to target a specific company.
2. **When RLS returns 0 rows, check the data first** — `SELECT DISTINCT company_id FROM <table>` before assuming the policy is broken.
3. **Never rename applied migrations** — create new remediation migrations instead. Supabase tracks filenames.
4. **Data-modifying CTEs share the same snapshot** — one CTE cannot see rows inserted by another CTE in the same `WITH` statement. Split into separate statements.
5. **Use Playwright for RLS debugging** — the Management API bypasses RLS (superuser), so SQL console tests are unreliable. Test with a real authenticated browser session.
6. **Supabase Management API magic link trick**: `POST /auth/v1/admin/generate_link` with service role key generates a magic link that can authenticate a Playwright session without Google OAuth credentials.

## Key Debugging Commands

```bash
# Check actual company_id values (bypasses RLS)
curl -s -X POST "https://api.supabase.com/v1/projects/{ref}/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT DISTINCT company_id FROM public.capabilities"}'

# Generate magic link for Playwright auth
curl -s -X POST "https://{ref}.supabase.co/auth/v1/admin/generate_link" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "magiclink", "email": "tom@zazig.com"}'

# Reload PostgREST schema cache after policy changes
curl -s -X POST ".../database/query" \
  -d '{"query": "NOTIFY pgrst, '"'"'reload schema'"'"'"}'
```
