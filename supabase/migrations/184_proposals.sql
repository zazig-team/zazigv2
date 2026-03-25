-- Migration: 184_proposals.sql
-- Create proposals and proposal_views tables with RLS

-- Proposals table
CREATE TABLE IF NOT EXISTS public.proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
    content jsonb NOT NULL DEFAULT '{"sections": []}'::jsonb,
    client_name text NOT NULL,
    client_logo_url text,
    client_brand_color text,
    prepared_by text NOT NULL,
    allowed_emails text[] NOT NULL DEFAULT '{}',
    pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
    valid_until timestamptz,
    viewed_at timestamptz,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Proposal views table (engagement analytics)
CREATE TABLE IF NOT EXISTS public.proposal_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    viewer_email text NOT NULL,
    viewed_at timestamptz NOT NULL DEFAULT now(),
    duration_seconds integer
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposals_company_id ON public.proposals(company_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposal_views_proposal_id ON public.proposal_views(proposal_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS proposals_updated_at_trigger ON public.proposals;
CREATE TRIGGER proposals_updated_at_trigger
    BEFORE UPDATE ON public.proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.proposals_updated_at();

-- RLS
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_views ENABLE ROW LEVEL SECURITY;

-- Internal access: company members get full CRUD on proposals
DROP POLICY IF EXISTS "company_member_all" ON public.proposals;
CREATE POLICY "company_member_all" ON public.proposals
    FOR ALL TO authenticated
    USING (public.user_in_company(company_id))
    WITH CHECK (public.user_in_company(company_id));

-- Proposal viewer access function
-- Column restriction is enforced at the application layer (view-proposal edge function
-- controls which fields are returned). RLS grants row-level access only.
CREATE OR REPLACE FUNCTION public.user_can_view_proposal(pid uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.proposals
        WHERE id = pid
        AND (
            (auth.jwt() ->> 'email') LIKE '%@zazig.com'
            OR (auth.jwt() ->> 'email') = ANY(allowed_emails)
        )
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- Proposal viewers can SELECT via RLS
DROP POLICY IF EXISTS "viewer_read" ON public.proposals;
CREATE POLICY "viewer_read" ON public.proposals
    FOR SELECT TO authenticated
    USING (public.user_can_view_proposal(id));

-- Internal: company members can manage views
DROP POLICY IF EXISTS "company_member_views" ON public.proposal_views;
CREATE POLICY "company_member_views" ON public.proposal_views
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_id
        AND public.user_in_company(p.company_id)
    ));

-- Viewers can insert their own view records
DROP POLICY IF EXISTS "viewer_insert_views" ON public.proposal_views;
CREATE POLICY "viewer_insert_views" ON public.proposal_views
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.proposals p
        WHERE p.id = proposal_id
        AND public.user_can_view_proposal(p.id)
    ));

-- Service role bypass (edge functions)
DROP POLICY IF EXISTS "service_role_proposals" ON public.proposals;
CREATE POLICY "service_role_proposals" ON public.proposals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_views" ON public.proposal_views;
CREATE POLICY "service_role_views" ON public.proposal_views
    FOR ALL TO service_role USING (true) WITH CHECK (true);
