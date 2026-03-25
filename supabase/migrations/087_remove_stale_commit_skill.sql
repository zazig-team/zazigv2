-- Remove stale commit-commands:commit skill from senior-engineer
-- (skill file doesn't exist on disk)
UPDATE roles
SET skills = array_remove(skills, 'commit-commands:commit')
WHERE 'commit-commands:commit' = ANY(skills);
