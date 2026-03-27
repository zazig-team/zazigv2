-- 142_complex_routing_to_senior_engineer.sql
-- Date: 2026-03-11
-- Purpose: Route complex jobs to senior-engineer via complexity_routing role mapping.

UPDATE public.complexity_routing
SET role_id = (SELECT id FROM public.roles WHERE name = 'senior-engineer')
WHERE complexity = 'complex';
