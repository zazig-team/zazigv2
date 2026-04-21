-- Migration 251: Row Level Security policies for idea_messages

BEGIN;

ALTER TABLE public.idea_messages ENABLE ROW LEVEL SECURITY;

-- Drop in case policies were partially applied in a prior environment.
DROP POLICY IF EXISTS "idea_messages_select_authenticated" ON public.idea_messages;
DROP POLICY IF EXISTS "idea_messages_insert_authenticated" ON public.idea_messages;

-- Authenticated users can read messages for ideas in companies they belong to.
CREATE POLICY "idea_messages_select_authenticated"
ON public.idea_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ideas i
    WHERE i.id = idea_messages.idea_id
      AND public.user_in_company(i.company_id)
  )
);

-- Authenticated users can insert messages for ideas in companies they belong to.
CREATE POLICY "idea_messages_insert_authenticated"
ON public.idea_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ideas i
    WHERE i.id = idea_messages.idea_id
      AND public.user_in_company(i.company_id)
  )
);

-- Jobs run via Edge Functions with service_role and bypass RLS by default,
-- so no additional job-only policy is required here.

COMMIT;
