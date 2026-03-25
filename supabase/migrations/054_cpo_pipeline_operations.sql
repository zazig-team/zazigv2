-- 054: Append Pipeline Operations behavioral trigger to CPO role prompt.
-- Ensures the CPO runs /drive-pipeline session start checklist on every wakeup.
-- The trigger lives in the role prompt (Position 2); the full procedures
-- stay in the skill file (Position 7).

-- 1. Append the Pipeline Operations section to the CPO prompt
UPDATE public.roles
SET prompt = prompt || E'\n\n---\n\n## Pipeline Operations\n\nAt the start of every human conversation or wakeup, run the /drive-pipeline session start checklist before addressing anything else:\n1. Inbox sweep — query_ideas(status: ''new''), report count\n2. Pipeline health — query features by status, flag stuck items\n3. Standalone backlog — check for accumulation\n\nWhen routing inbound work, use /drive-pipeline scope assessment.\nWhen receiving pipeline notifications, follow /drive-pipeline handling procedures.\nWhen the human mentions something not ready for the pipeline, capture it as an idea via create_idea.\n\n/drive-pipeline is your operational runbook. It stays loaded as a reference.'
WHERE name = 'cpo';

-- 2. Add drive-pipeline to CPO skills array (idempotent)
UPDATE public.roles
SET skills = array_append(skills, 'drive-pipeline')
WHERE name = 'cpo'
  AND NOT ('drive-pipeline' = ANY(skills));
