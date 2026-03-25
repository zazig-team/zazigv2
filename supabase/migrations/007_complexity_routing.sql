-- 007_complexity_routing.sql
-- Date: 2026-02-20
-- Purpose: Move model/slot routing out of hardcoded orchestrator logic into DB tables.
--
-- Two changes:
--   1. Add `slot_type` column to roles (codex vs claude_code)
--   2. Create `complexity_routing` table mapping complexity → role
--
-- This lets operators change the mapping (e.g. "simple → codex" or "simple → sonnet")
-- without redeploying the orchestrator edge function.

-- ============================================================
-- Add slot_type to roles
-- ============================================================

ALTER TABLE public.roles
    ADD COLUMN slot_type text NOT NULL DEFAULT 'claude_code'
    CHECK (slot_type IN ('claude_code', 'codex'));

COMMENT ON COLUMN public.roles.slot_type IS
    'Which slot type this role consumes on a machine (claude_code or codex).';

-- ============================================================
-- Rename and update existing roles
-- ============================================================

-- Rename 'engineer' → 'senior-engineer' (sonnet, claude_code)
UPDATE public.roles
SET name = 'senior-engineer',
    description = 'Senior engineer — handles medium-complexity code jobs with Claude Sonnet',
    default_model = 'claude-sonnet-4-6',
    slot_type = 'claude_code'
WHERE name = 'engineer';

-- Rename 'reviewer' → keep as-is but update model
UPDATE public.roles
SET default_model = 'claude-sonnet-4-6',
    slot_type = 'claude_code'
WHERE name = 'reviewer';

-- CPO: opus
UPDATE public.roles
SET default_model = 'claude-opus-4-6',
    slot_type = 'claude_code'
WHERE name = 'cpo';

-- CTO: sonnet (+ 2nd opinion skill TBD)
UPDATE public.roles
SET default_model = 'claude-sonnet-4-6',
    slot_type = 'claude_code'
WHERE name = 'cto';

-- Add junior-engineer (codex)
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type) VALUES
    ('junior-engineer', 'Junior engineer — handles simple/mechanical tasks with Codex', false, 'codex', 'codex');

-- ============================================================
-- complexity_routing
-- Maps complexity levels to roles for job dispatch.
-- The orchestrator looks up the role for a job's complexity,
-- then reads model + slot_type from the role.
-- ============================================================

CREATE TABLE public.complexity_routing (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
    complexity  text        NOT NULL CHECK (complexity IN ('simple', 'medium', 'complex')),
    role_id     uuid        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, complexity)
);

COMMENT ON TABLE public.complexity_routing IS
    'Maps job complexity to a role (which carries model + slot_type). '
    'company_id nullable: NULL = global default. Company-specific rows override globals. '
    'The orchestrator resolves complexity → role → (model, slot_type) at dispatch time.';

ALTER TABLE public.complexity_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.complexity_routing
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.complexity_routing
    FOR SELECT
    TO authenticated
    USING (company_id IS NULL OR company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- Seed global defaults
--   simple  → junior-engineer (codex)
--   medium  → senior-engineer (sonnet)
--   complex → cpo (opus)
-- ============================================================

INSERT INTO public.complexity_routing (company_id, complexity, role_id)
SELECT NULL, 'simple', id FROM public.roles WHERE name = 'junior-engineer';

INSERT INTO public.complexity_routing (company_id, complexity, role_id)
SELECT NULL, 'medium', id FROM public.roles WHERE name = 'senior-engineer';

INSERT INTO public.complexity_routing (company_id, complexity, role_id)
SELECT NULL, 'complex', id FROM public.roles WHERE name = 'cpo';
