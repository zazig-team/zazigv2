-- Migration: 183_cso_personality_seed.sql
-- Seed CSO personality for zazig-dev company with Relationship Builder archetype

INSERT INTO public.exec_personalities (
    company_id,
    role_id,
    archetype_id
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.roles WHERE name = 'cso'),
    (SELECT id FROM public.exec_archetypes
     WHERE name = 'relationship_builder'
     AND role_id = (SELECT id FROM public.roles WHERE name = 'cso'))
)
ON CONFLICT (company_id, role_id) DO UPDATE SET
    archetype_id = EXCLUDED.archetype_id;
