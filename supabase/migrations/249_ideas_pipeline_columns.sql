-- Migration 249: add idea pipeline columns and extend pipeline statuses

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ideas'
      AND column_name = 'on_hold'
  ) THEN
    ALTER TABLE public.ideas
      ADD COLUMN on_hold BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ideas'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.ideas
      ADD COLUMN type TEXT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ideas_type_check'
      AND conrelid = 'public.ideas'::regclass
  ) THEN
    ALTER TABLE public.ideas
      ADD CONSTRAINT ideas_type_check
      CHECK (type IN ('bug', 'feature', 'task', 'initiative'));
  END IF;
END
$$;

ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_status_check
  CHECK (status IN (
    'new',
    'triaging',
    'triaged',
    'developing',
    'specced',
    'workshop',
    'hardening',
    'parked',
    'rejected',
    'promoted',
    'done',
    'stalled',
    'enriched',
    'routed',
    'executing',
    'breaking_down',
    'spawned',
    'awaiting_response'
  ));

COMMIT;
