-- Migration 252: ensure Realtime emits full idea_messages payloads

BEGIN;

ALTER TABLE public.idea_messages REPLICA IDENTITY FULL;

COMMIT;
