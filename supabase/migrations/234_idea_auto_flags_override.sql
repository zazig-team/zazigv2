-- 234_idea_auto_flags_override.sql
-- Per-idea overrides for auto_triage / auto_spec.
--
-- Default behavior unchanged: NULL falls back to the company-level
-- auto_triage_types / auto_spec_types. TRUE forces on for this idea.
-- FALSE forces off. Callers like hermes can opt out a single draft
-- idea without flipping the whole company.
--
-- Two helper functions centralize the resolution logic so the daemon
-- (or webui, or any caller) can ask a single question instead of
-- duplicating the COALESCE everywhere.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS auto_triage BOOLEAN,
  ADD COLUMN IF NOT EXISTS auto_spec   BOOLEAN;

COMMENT ON COLUMN public.ideas.auto_triage IS
  'Per-idea override. NULL => fall back to companies.auto_triage_types. TRUE/FALSE forces the behavior for this idea only.';
COMMENT ON COLUMN public.ideas.auto_spec IS
  'Per-idea override. NULL => fall back to companies.auto_spec_types. TRUE/FALSE forces the behavior for this idea only.';

CREATE OR REPLACE FUNCTION public.idea_should_auto_triage(p_idea_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    i.auto_triage,
    i.item_type = ANY(COALESCE(c.auto_triage_types, ARRAY[]::text[]))
  )
  FROM public.ideas i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.id = p_idea_id;
$$;

CREATE OR REPLACE FUNCTION public.idea_should_auto_spec(p_idea_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    i.auto_spec,
    i.item_type = ANY(COALESCE(c.auto_spec_types, ARRAY[]::text[]))
  )
  FROM public.ideas i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.id = p_idea_id;
$$;

REVOKE EXECUTE ON FUNCTION public.idea_should_auto_triage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.idea_should_auto_spec(uuid)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.idea_should_auto_triage(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.idea_should_auto_spec(uuid)   TO authenticated, service_role;
