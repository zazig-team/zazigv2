-- 239_auto_promote.sql
-- Auto-promote: the third and final stage of the auto-pipeline.
--
-- Completes the automation chain alongside auto_triage (migrations 135/148/229)
-- and auto_spec (143/147/156/165/229). Fires on two inputs:
--
--   (a) status='triaged' AND triage_route='promote'
--       — expert triaged the idea as "clear enough, no spec needed".
--         Orchestrator calls promote-idea directly.
--
--   (b) status='specced' (any triage_route)
--       — auto-spec finished. Next stage is feature creation.
--         Orchestrator calls promote-idea to create the feature.
--
-- Both paths require project_id set on the idea. The orchestrator will
-- gate on that (same pattern as auto_spec).
--
-- Mirrors the per-type + per-idea control surface:
--   * companies.auto_promote_types text[]   — company-level on/off per item_type
--   * ideas.auto_promote         BOOLEAN    — per-idea override (NULL => company default)
--   * public.idea_should_auto_promote(uuid) — SECURITY DEFINER resolver

-- Company-level setting
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_promote_types text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.companies.auto_promote_types IS
  'Item types that are auto-promoted (triaged->promote or specced -> promoted+feature). Default empty = off.';

-- Backfill: companies that have auto_spec_types enabled probably also want
-- auto_promote_types — they've opted into the full chain. Preserve that
-- intent by copying the same set on first run. No-op if already populated.
UPDATE public.companies
SET auto_promote_types = auto_spec_types
WHERE auto_promote_types = '{}' AND auto_spec_types <> '{}';

-- Per-idea override
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS auto_promote BOOLEAN;

COMMENT ON COLUMN public.ideas.auto_promote IS
  'Per-idea override. NULL => fall back to companies.auto_promote_types. TRUE/FALSE forces the behavior for this idea only.';

-- Resolver (mirrors idea_should_auto_triage / idea_should_auto_spec in mig 234)
CREATE OR REPLACE FUNCTION public.idea_should_auto_promote(p_idea_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    i.auto_promote,
    i.item_type = ANY(COALESCE(c.auto_promote_types, ARRAY[]::text[]))
  )
  FROM public.ideas i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.id = p_idea_id;
$$;

REVOKE EXECUTE ON FUNCTION public.idea_should_auto_promote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.idea_should_auto_promote(uuid) TO authenticated, service_role;
