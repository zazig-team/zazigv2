-- 091_triage_skill_extract.sql
-- Extract inbox triage workflow from CPO prompt into standalone /triage skill.
-- Removes the Originator Convention, Triage Sweep, and Inbox Hygiene subsections
-- from the CPO prompt and replaces them with a short /triage skill reference.

BEGIN;

-- Step 1: Remove Originator Convention + Triage Sweep subsections.
-- These appear between the end of the Intake section and ## Workshop Features.
-- Replaced with a lean /triage reference.
UPDATE public.roles
SET prompt = regexp_replace(
  prompt,
  E'\n\n   ### Originator Convention.*?(?=\n\n  ## Workshop Features)',
  E'\n\n  ### Triage\n\n  Run /triage to sweep and triage the ideas inbox.',
  'gs'
)
WHERE name = 'cpo';

-- Step 2: Remove Inbox Hygiene (During Standup) subsection.
-- Appears between ## Workshop Features and the --- divider before ## Pipeline Operations.
UPDATE public.roles
SET prompt = regexp_replace(
  prompt,
  E'\n\n  ### Inbox Hygiene \\(During Standup\\).*?(?=\n\n  ---)',
  '',
  'gs'
)
WHERE name = 'cpo';

-- Step 3: Add 'triage' to CPO skills array (idempotent).
UPDATE public.roles
SET skills = array_append(skills, 'triage')
WHERE name = 'cpo'
  AND NOT ('triage' = ANY(skills));

COMMIT;
