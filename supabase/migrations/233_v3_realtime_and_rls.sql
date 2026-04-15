-- 233_v3_realtime_and_rls.sql
-- Wire ideas/features/events for v3 iOS consumption:
--   1. Ensure each table is in the supabase_realtime publication.
--   2. Ensure authenticated users can SELECT rows scoped to their companies.
--   3. Allow source='mobile' on ideas so v3 can tag its origin.
--
-- Everything is idempotent — safe to re-run. Some rows below may already be
-- applied via direct ALTER (per napkin line 112); the DO blocks make that a no-op.

-- ---------------------------------------------------------------------------
-- 1. Realtime publication
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ideas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'features'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.features;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. RLS — SELECT policy on ideas for authenticated users, scoped by company.
-- ---------------------------------------------------------------------------
-- features and events already covered by migration 028. ideas had no SELECT
-- policy in migrations but webui relies on one — this reasserts it.

DROP POLICY IF EXISTS "authenticated_read_own" ON public.ideas;
CREATE POLICY "authenticated_read_own" ON public.ideas
  FOR SELECT TO authenticated
  USING (public.user_in_company(company_id));

-- ---------------------------------------------------------------------------
-- 3. Extend ideas.source CHECK to include 'mobile' (v3 iOS) and 'ios'.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_source_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_source_check
  CHECK (source = ANY (ARRAY[
    'terminal','slack','telegram','agent','web','api','monitoring','mobile','ios'
  ]));
