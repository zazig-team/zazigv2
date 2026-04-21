-- Migration 248: add nullable jobs.idea_id link to ideas

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS idea_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_idea_id_fkey'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_idea_id_fkey
      FOREIGN KEY (idea_id)
      REFERENCES public.ideas(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_jobs_idea_id
  ON public.jobs(idea_id);

COMMIT;
