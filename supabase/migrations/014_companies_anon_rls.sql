-- 014_companies_anon_rls.sql
-- Adds read-only SELECT policy for the anon role on companies.
-- Required for the pipeline dashboard to resolve company slugs
-- (/{company-name} route) via the anon key.
--
-- Security: anon can only SELECT — no INSERT, UPDATE, or DELETE.

CREATE POLICY "anon_read_all" ON public.companies
    FOR SELECT
    TO anon
    USING (true);
