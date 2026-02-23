-- Join table: links auth users to companies (many-to-many)
-- Replaces the single company_id JWT claim model.
CREATE TABLE IF NOT EXISTS public.user_companies (
    user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, company_id)
);

-- RLS
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- Users can see their own company memberships
CREATE POLICY "read_own_memberships" ON public.user_companies
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Users can insert themselves into companies (done by zazig setup)
CREATE POLICY "insert_own_membership" ON public.user_companies
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Service role has full access
CREATE POLICY "service_role_full_access" ON public.user_companies
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Fast lookups by user_id (for local agent startup query)
CREATE INDEX user_companies_user_idx ON public.user_companies(user_id);
