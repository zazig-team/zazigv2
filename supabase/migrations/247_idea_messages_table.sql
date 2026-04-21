-- Migration 247: idea_messages table
-- Adds threaded messaging for ideas and wires table into Realtime publication.

BEGIN;

CREATE TABLE IF NOT EXISTS public.idea_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  job_id     uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  sender     text NOT NULL CHECK (sender IN ('job', 'user')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idea_messages_idea_id_created_at_idx
  ON public.idea_messages (idea_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'idea_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.idea_messages;
  END IF;
END $$;

COMMIT;
