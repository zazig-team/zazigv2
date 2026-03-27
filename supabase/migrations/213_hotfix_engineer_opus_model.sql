-- Upgrade hotfix-engineer to opus for higher quality interactive fixes
UPDATE expert_roles
SET model = 'claude-opus-4-6'
WHERE name = 'hotfix-engineer';
