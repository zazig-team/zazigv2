-- Expand ideas status values for idea hardening pipeline states.
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new','triaged','workshop','hardening','parked','rejected','promoted','done'
  ]));

-- Optional for manually-created capabilities, populated for pipeline-created ones.
ALTER TABLE public.capabilities ADD COLUMN IF NOT EXISTS plan_doc_path TEXT;
