-- Add dispatch-subagent to the CPO role skills array (idempotent).

BEGIN;

UPDATE public.roles
  SET skills = array_append(skills, 'dispatch-subagent')
WHERE name = 'cpo'
  AND NOT ('dispatch-subagent' = ANY(skills));

COMMIT;
