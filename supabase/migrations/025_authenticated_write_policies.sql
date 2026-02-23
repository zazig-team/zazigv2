-- Allow authenticated users to register and update their own machines
-- company_id claim is set by custom Supabase JWT hook
CREATE POLICY "authenticated_insert_own" ON public.machines
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_update_own" ON public.machines
    FOR UPDATE
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Allow authenticated users to update their own job statuses (heartbeats,
-- result writing, progress updates)
CREATE POLICY "authenticated_update_own" ON public.jobs
    FOR UPDATE
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Allow authenticated users to log lifecycle events
CREATE POLICY "authenticated_insert_own" ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);
