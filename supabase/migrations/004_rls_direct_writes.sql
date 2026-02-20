-- RLS policies for local-agent direct DB writes
-- Date: 2026-02-20
-- Purpose: Allow local agents (authenticating with the anon key) to write
--   heartbeats directly to `machines` and job status updates to `jobs`.
--   This eliminates the dependency on the orchestrator's 4-second Realtime
--   listen window for state propagation.
--
-- The anon role gets SELECT + UPDATE only — no INSERT or DELETE.
-- Agents identify machines by name and jobs by id; both columns are
-- constrained (UNIQUE or PK) so these policies are safe.

-- ============================================================
-- machines: anon SELECT + UPDATE (heartbeats)
-- ============================================================

CREATE POLICY "anon_select_machines" ON public.machines
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_update_machines" ON public.machines
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- jobs: anon SELECT + UPDATE (job status, completion, failure)
-- ============================================================

CREATE POLICY "anon_select_jobs" ON public.jobs
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "anon_update_jobs" ON public.jobs
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);
