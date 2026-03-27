-- Migration 227: Replace .claude report paths with .reports in roles.prompt.

-- Pre-check: any role prompt entries still referencing .claude/*-report.md
SELECT name
FROM roles
WHERE prompt LIKE '%.claude/%-report.md%';

UPDATE roles
SET prompt = REPLACE(prompt, '.claude/', '.reports/')
WHERE prompt LIKE '%.claude/%-report.md%';

-- Post-check: should return zero rows.
SELECT name
FROM roles
WHERE prompt LIKE '%.claude/%-report.md%';

-- Verification query requested for report-style matches.
SELECT name
FROM roles
WHERE prompt LIKE '%.claude/%-report%';
