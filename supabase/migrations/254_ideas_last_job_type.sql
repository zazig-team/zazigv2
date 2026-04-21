-- Migration 254: add ideas.last_job_type for resume dispatch tracking

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ideas'
      AND column_name = 'last_job_type'
  ) THEN
    ALTER TABLE public.ideas
      ADD COLUMN last_job_type TEXT;
  END IF;
END
$$;

COMMIT;
