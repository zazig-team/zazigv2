-- 028_rls_user_companies.sql
-- Replace JWT claim-based RLS policies with user_companies join table lookups.
-- This enables multi-company access for authenticated users.

-- Helper: returns true if the authenticated user belongs to the given company.
-- Used in RLS policy WITH CHECK and USING expressions.
CREATE OR REPLACE FUNCTION public.user_in_company(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = auth.uid() AND company_id = cid
  )
$$;

-- ============================================================
-- companies
-- ============================================================

-- Drop old SELECT policy (003: scoped by JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.companies;

CREATE POLICY "authenticated_read_own" ON public.companies
    FOR SELECT TO authenticated
    USING (public.user_in_company(id));

-- Drop and recreate INSERT policy (024: was WITH CHECK true — keep permissive)
DROP POLICY IF EXISTS "authenticated_insert_company" ON public.companies;

CREATE POLICY "authenticated_insert_company" ON public.companies
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ============================================================
-- machines
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.machines;

CREATE POLICY "authenticated_read_own" ON public.machines
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Drop old INSERT/UPDATE policies (025: JWT claim)
-- Machines are physical devices — they serve ALL companies the user belongs to,
-- not locked to one company. Open authenticated policies are fine here;
-- machines are identified by name and API key, not by user ownership.
DROP POLICY IF EXISTS "authenticated_insert_own" ON public.machines;
DROP POLICY IF EXISTS "authenticated_update_own" ON public.machines;

CREATE POLICY "authenticated_insert_own" ON public.machines
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "authenticated_update_own" ON public.machines
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- projects
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.projects;

CREATE POLICY "authenticated_read_own" ON public.projects
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Drop old INSERT policy (024: JWT claim)
DROP POLICY IF EXISTS "authenticated_insert_own_project" ON public.projects;

CREATE POLICY "authenticated_insert_own_project" ON public.projects
    FOR INSERT TO authenticated
    WITH CHECK (public.user_in_company(company_id));

-- ============================================================
-- features
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.features;

CREATE POLICY "authenticated_read_own" ON public.features
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- ============================================================
-- jobs
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.jobs;

CREATE POLICY "authenticated_read_own" ON public.jobs
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Drop old UPDATE policy (025: JWT claim)
DROP POLICY IF EXISTS "authenticated_update_own" ON public.jobs;

CREATE POLICY "authenticated_update_own" ON public.jobs
    FOR UPDATE TO authenticated
    USING (public.user_in_company(company_id))
    WITH CHECK (public.user_in_company(company_id));

-- ============================================================
-- events
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.events;

CREATE POLICY "authenticated_read_own" ON public.events
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Drop old INSERT policy (025: JWT claim)
DROP POLICY IF EXISTS "authenticated_insert_own" ON public.events;

CREATE POLICY "authenticated_insert_own" ON public.events
    FOR INSERT TO authenticated
    WITH CHECK (public.user_in_company(company_id));

-- ============================================================
-- messages
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.messages;

CREATE POLICY "authenticated_read_own" ON public.messages
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Drop old INSERT policy (003: JWT claim + from_role = 'human')
DROP POLICY IF EXISTS "authenticated_insert_own" ON public.messages;

CREATE POLICY "authenticated_insert_own" ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        public.user_in_company(company_id)
        AND from_role = 'human'
    );

-- ============================================================
-- memory_chunks
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.memory_chunks;

CREATE POLICY "authenticated_read_own" ON public.memory_chunks
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- ============================================================
-- company_roles
-- ============================================================

-- Drop old SELECT policy (003: JWT claim)
DROP POLICY IF EXISTS "authenticated_read_own" ON public.company_roles;

CREATE POLICY "authenticated_read_own" ON public.company_roles
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- ============================================================
-- Anon read policies for dashboard (uses anon key, not authenticated JWT)
-- ============================================================
-- Policies from 013 (features, jobs) and 014 (companies) are NOT dropped above
-- (they use different policy names: "anon_read_all" vs "authenticated_read_own"),
-- so they remain intact. Only machines was missing an anon read policy.

CREATE POLICY "anon_read_all" ON public.machines
    FOR SELECT TO anon
    USING (true);
