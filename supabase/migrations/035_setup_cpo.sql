-- 035_setup_cpo.sql
-- RPC function for setup flow: enables CPO role + seeds personality in one call.
-- Also adds authenticated read policy on slack_installations so the CLI can poll
-- for OAuth completion.

BEGIN;

-- ============================================================
-- 1. Allow authenticated users to read their own Slack installations
--    (needed for CLI polling during setup OAuth flow)
-- ============================================================

CREATE POLICY "authenticated_read_own" ON public.slack_installations
    FOR SELECT TO authenticated
    USING (public.user_in_company(company_id));

-- ============================================================
-- 2. setup_company_cpo RPC
--    Enables the CPO role for a company and seeds the personality
--    from the chosen archetype. SECURITY DEFINER bypasses RLS
--    since company_roles and exec_personalities only allow
--    service_role writes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.setup_company_cpo(
    p_company_id UUID,
    p_archetype_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id UUID;
    v_archetype_id UUID;
BEGIN
    -- Look up CPO role
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'cpo';
    IF v_role_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CPO role not found');
    END IF;

    -- Enable CPO role for this company
    INSERT INTO public.company_roles (company_id, role_id, enabled)
    VALUES (p_company_id, v_role_id, true)
    ON CONFLICT (company_id, role_id) DO UPDATE SET enabled = true;

    -- Look up the archetype
    SELECT id INTO v_archetype_id
    FROM public.exec_archetypes
    WHERE role_id = v_role_id AND name = p_archetype_name;

    IF v_archetype_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Archetype not found: ' || p_archetype_name);
    END IF;

    -- Seed the personality
    INSERT INTO public.exec_personalities (company_id, role_id, archetype_id)
    VALUES (p_company_id, v_role_id, v_archetype_id)
    ON CONFLICT (company_id, role_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.setup_company_cpo IS
    'Setup flow helper: enables CPO role for a company and seeds the personality '
    'from the chosen archetype. Called by `zazig setup` CLI command. '
    'SECURITY DEFINER so it can write to company_roles and exec_personalities.';

COMMIT;
