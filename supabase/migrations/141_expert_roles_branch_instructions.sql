UPDATE expert_roles
SET prompt = prompt || E'\n\nYou are working on a dedicated expert branch. The branch has already been created and checked out for you (named expert/{role}-{session-id}).\n\nWhen your work is complete:\n1. Commit all changes to the current branch\n2. The system will automatically push your branch, merge it to master, and clean up\n\nDo NOT switch branches or checkout master directly. Work only on the current branch.'
WHERE name IN ('hotfix-engineer', 'supabase-expert', 'test-deployment-expert');
