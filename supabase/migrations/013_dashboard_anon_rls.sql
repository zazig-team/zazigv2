-- 013_dashboard_anon_rls.sql
-- Adds read-only SELECT policies for the anon role on features and jobs.
-- Required for the pipeline dashboard (dashboard/index.html) to query Supabase
-- via the anon key without needing an authenticated session.
--
-- Security: anon can only SELECT — no INSERT, UPDATE, or DELETE.
-- The dashboard is a read-only internal tool; all rows are intentionally visible.

CREATE POLICY "anon_read_all" ON public.features
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_read_all" ON public.jobs
    FOR SELECT
    TO anon
    USING (true);
