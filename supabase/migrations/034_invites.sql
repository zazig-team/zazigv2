-- 034: Invite system
-- Stores pending invites by email. When the invited person runs `zazig setup`,
-- they see pending invites and can choose which to accept.

CREATE TABLE public.invites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL,
    invited_by  UUID        NOT NULL REFERENCES auth.users(id),
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending invite per email per company
CREATE UNIQUE INDEX invites_email_company_pending
    ON public.invites (email, company_id) WHERE status = 'pending';

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.invites
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Members of a company can create invites for that company
CREATE POLICY "authenticated_insert_invite" ON public.invites
    FOR INSERT TO authenticated
    WITH CHECK (public.user_in_company(company_id));

-- Members can see invites for their companies
CREATE POLICY "authenticated_read_own" ON public.invites
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- Returns pending invites for the current user's email.
-- SECURITY DEFINER so it can read auth.users and see invites the user
-- can't normally SELECT (they're not in the company yet).
CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE (invite_id UUID, company_id UUID, company_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
    IF user_email IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
        SELECT i.id, i.company_id, c.name
        FROM public.invites i
        JOIN public.companies c ON c.id = i.company_id
        WHERE i.email = user_email AND i.status = 'pending';
END;
$$;

-- Accepts a single invite by ID: links user to company, marks accepted.
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv RECORD;
    user_email TEXT;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    SELECT * INTO inv FROM public.invites
    WHERE id = p_invite_id AND email = user_email AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found or not yours';
    END IF;

    INSERT INTO public.user_companies (user_id, company_id)
    VALUES (auth.uid(), inv.company_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.invites SET status = 'accepted' WHERE id = p_invite_id;
END;
$$;

-- Declines a single invite by ID.
CREATE OR REPLACE FUNCTION public.decline_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    UPDATE public.invites SET status = 'declined'
    WHERE id = p_invite_id AND email = user_email AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found or not yours';
    END IF;
END;
$$;
