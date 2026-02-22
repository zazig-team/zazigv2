-- 019_authenticated_write_policies.sql
-- Date: 2026-02-23
-- Purpose: Add RLS policies allowing the `authenticated` role to write to
--   machines and jobs tables. Previously, all writes used the service_role key
--   which bypasses RLS entirely. With CLI auth migrated to Supabase Auth (JWT),
--   the local-agent now writes using the authenticated role and company_id
--   is enforced via the JWT claim.
--
-- Security model change:
--   Before: service_role key (bypasses RLS) stored on operator machines
--   After:  authenticated JWT (RLS-scoped by company_id) — no service-role key on machines
--
-- Tables affected:
--   machines — heartbeat writes, auto-registration (INSERT + UPDATE)
--   jobs     — status updates, progress, log appends (UPDATE)

-- ============================================================
-- machines: INSERT (auto-registration on first connect)
-- ============================================================

CREATE POLICY "authenticated_insert_own" ON public.machines
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- machines: UPDATE (heartbeat, slot availability, status)
-- ============================================================

CREATE POLICY "authenticated_update_own" ON public.machines
    FOR UPDATE
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- jobs: UPDATE (status, result, progress, assembled_context, raw_log)
-- ============================================================

CREATE POLICY "authenticated_update_own" ON public.jobs
    FOR UPDATE
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- events: INSERT (lifecycle logging from authenticated agents)
-- ============================================================

CREATE POLICY "authenticated_insert_own" ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- Update append_raw_log function to enforce company_id check
-- This function is called by authenticated clients; since RLS
-- applies to the UPDATE it performs on jobs, the company_id
-- check is already enforced by the policy above. No change needed
-- to the function itself.
-- ============================================================

-- Note: 014_companies_anon_rls.sql has a wide-open anon SELECT on companies.
-- This can be tightened to authenticated-only once the dashboard also uses
-- authenticated sessions. Left as-is for backward compatibility with the
-- pipeline dashboard which resolves company slugs via the anon key.
