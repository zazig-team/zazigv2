-- 240_replica_identity_full.sql
-- Ensure Realtime UPDATE payloads include all columns (not just PK + changed).
-- Without this, v3 subscribers miss fields like triage_route, triage_notes,
-- spec, acceptance_tests on partial updates.

ALTER TABLE public.ideas    REPLICA IDENTITY FULL;
ALTER TABLE public.features REPLICA IDENTITY FULL;
ALTER TABLE public.events   REPLICA IDENTITY FULL;
