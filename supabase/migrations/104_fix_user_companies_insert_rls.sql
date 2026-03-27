-- 104_fix_user_companies_insert_rls.sql
-- Fix circular RLS dependency: user_companies INSERT policy queries companies
-- table, but the companies SELECT policy calls user_in_company() which queries
-- user_companies — creating a chicken-and-egg problem for new company creators.
--
-- Fix: use a SECURITY DEFINER function for the ownership check so it bypasses
-- RLS on the companies table.

CREATE OR REPLACE FUNCTION public.user_is_company_creator(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = cid AND created_by = auth.uid()
  )
$$;

-- Drop and recreate the insert policy using the new function
DROP POLICY IF EXISTS "insert_own_membership" ON public.user_companies;

CREATE POLICY "insert_own_membership" ON public.user_companies
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND (
            -- Company creator can always join their own company
            public.user_is_company_creator(company_id)
            OR
            -- Initial setup: no members yet
            NOT EXISTS (
                SELECT 1 FROM public.user_companies existing
                WHERE existing.company_id = company_id
            )
        )
    );
