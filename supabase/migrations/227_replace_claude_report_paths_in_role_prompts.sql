-- Migrate role prompts: replace .claude/ report paths with .reports/
-- Verify before
SELECT name FROM roles WHERE prompt LIKE '%.claude/%-report.md%';

-- Bulk replace
UPDATE roles
SET prompt = REPLACE(prompt, '.claude/', '.reports/')
WHERE prompt LIKE '%.claude/%-report.md%';

-- Verify after (should return 0 rows)
SELECT name FROM roles WHERE prompt LIKE '%.claude/%-report.md%';
