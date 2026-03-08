-- 127_fix_capabilities_company_id.sql
-- Fix: seed migrations used SELECT id FROM companies LIMIT 1 (without ORDER BY),
-- which returned an arbitrary company. On production this was "Test Co" instead
-- of "zazig-dev". Move all capabilities and lanes to the correct company.

UPDATE public.capability_lanes
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id != '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.capabilities
SET company_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE company_id != '00000000-0000-0000-0000-000000000001'::uuid;
