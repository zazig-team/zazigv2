-- Fix features update policy to use user_in_company() instead of JWT claim.
-- Also matches the pattern used by jobs (028_rls_user_companies.sql).
DROP POLICY IF EXISTS "authenticated_update_own" ON public.features;

CREATE POLICY "authenticated_update_own" ON public.features
    FOR UPDATE TO authenticated
    USING (public.user_in_company(company_id))
    WITH CHECK (public.user_in_company(company_id));
