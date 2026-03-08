-- 126_fix_capabilities_rls.sql
-- Fix RLS on capability_lanes and capabilities tables.
-- They were created (migration 121) with the old JWT claim pattern which doesn't
-- work — switch to user_in_company() established in migration 028.

DROP POLICY IF EXISTS "authenticated_read_own" ON public.capability_lanes;
CREATE POLICY "authenticated_read_own" ON public.capability_lanes
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

DROP POLICY IF EXISTS "authenticated_read_own" ON public.capabilities;
CREATE POLICY "authenticated_read_own" ON public.capabilities
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));
