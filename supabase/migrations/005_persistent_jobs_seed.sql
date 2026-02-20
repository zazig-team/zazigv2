-- zazigv2 persistent jobs seed migration
-- Date: 2026-02-20
-- Purpose: Seed a CPO persistent job per company on system start.
--
-- The jobs table (003_multi_tenant_schema.sql) already supports:
--   job_type = 'persistent_agent'
--   role = 'cpo' (references roles.name)
--   complexity and slot_type nullable for persistent jobs
--
-- The roles table (003_multi_tenant_schema.sql) already seeds CPO with is_persistent = true.
--
-- This migration:
--   1. Creates a trigger function that auto-creates a persistent job when a
--      company enables a persistent role via company_roles.
--   2. Seeds an initial company + company_role for development/testing.

-- ============================================================
-- Function: auto-create persistent jobs when a company enables a persistent role
-- ============================================================

CREATE OR REPLACE FUNCTION create_persistent_job_on_role_enable()
RETURNS TRIGGER AS $$
DECLARE
    v_role RECORD;
BEGIN
    -- Only fire when enabled transitions to true (INSERT with enabled=true, or UPDATE from false to true)
    IF NEW.enabled = true THEN
        SELECT name, is_persistent, default_model
        INTO v_role
        FROM public.roles
        WHERE id = NEW.role_id;

        IF v_role.is_persistent THEN
            -- Check if a persistent job already exists for this company + role
            IF NOT EXISTS (
                SELECT 1 FROM public.jobs
                WHERE company_id = NEW.company_id
                  AND role = v_role.name
                  AND job_type = 'persistent_agent'
                  AND status NOT IN ('failed')
            ) THEN
                INSERT INTO public.jobs (
                    company_id,
                    role,
                    job_type,
                    slot_type,
                    status,
                    context
                ) VALUES (
                    NEW.company_id,
                    v_role.name,
                    'persistent_agent',
                    'claude_code',
                    'queued',
                    'Persistent ' || v_role.name || ' agent. Auto-created when role was enabled for company.'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_persistent_job_on_role_enable() IS
    'Auto-creates a queued persistent_agent job when a company enables a persistent role. '
    'Checks for existing non-failed persistent jobs to prevent duplicates. '
    'Triggered by INSERT or UPDATE on company_roles.';

-- Trigger on company_roles: fire after INSERT or UPDATE of enabled column
CREATE TRIGGER trg_create_persistent_job
    AFTER INSERT OR UPDATE OF enabled ON public.company_roles
    FOR EACH ROW
    EXECUTE FUNCTION create_persistent_job_on_role_enable();

-- ============================================================
-- Seed data for development: a default company with CPO enabled
-- ============================================================

-- Create a placeholder company for development
INSERT INTO public.companies (id, name, status) VALUES
    ('00000000-0000-0000-0000-000000000001', 'zazig-dev', 'active')
ON CONFLICT (id) DO NOTHING;

-- Enable CPO and CTO roles for the dev company
-- (This triggers the create_persistent_job_on_role_enable function above,
--  which auto-creates the persistent jobs.)
INSERT INTO public.company_roles (company_id, role_id, enabled)
SELECT
    '00000000-0000-0000-0000-000000000001',
    r.id,
    true
FROM public.roles r
WHERE r.is_persistent = true
ON CONFLICT (company_id, role_id) DO NOTHING;
