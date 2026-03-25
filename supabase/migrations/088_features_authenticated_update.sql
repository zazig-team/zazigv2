-- Allow authenticated users to update features belonging to their company.
-- Needed for local-agent PR URL writes (uses authenticated JWT, not service_role).
-- Uses user_in_company() for consistency with 028_rls_user_companies.sql.
DROP POLICY IF EXISTS "authenticated_update_own" ON public.features;

CREATE POLICY "authenticated_update_own" ON public.features
    FOR UPDATE
    TO authenticated
    USING (public.user_in_company(company_id))
    WITH CHECK (public.user_in_company(company_id));
