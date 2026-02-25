-- 051_projects_anon_rls.sql
-- Adds read-only SELECT policy for the anon role on projects.
-- Required for the MCP agent server (query_projects tool) which queries
-- the PostgREST API with the anon key.
-- Matches the existing pattern from 013 (features, jobs) and 014 (companies).

CREATE POLICY "anon_read_all" ON public.projects
    FOR SELECT
    TO anon
    USING (true);
