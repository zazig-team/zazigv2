-- Migration 200: Add rebase-onto-master step to job-combiner before pushing.
-- After merging all job branches, rebase the feature branch onto origin/master
-- before pushing to avoid merge conflicts at PR time.
-- Idempotent: only applies if the old step numbering is still present.

UPDATE public.roles
SET prompt = REPLACE(
  prompt,
  '3. Push the feature branch
4. After merging all branches, verify the result builds before reporting success
5. Write the report as described above
6. The orchestrator will then create a verify job automatically',
  '3. Rebase onto latest master before pushing: `git fetch origin +refs/heads/master:refs/remotes/origin/master && git rebase origin/master`. If rebase conflicts arise, resolve them carefully.
4. Push the feature branch
5. After merging all branches, verify the result builds before reporting success
6. Write the report as described above
7. The orchestrator will then create a verify job automatically'
)
WHERE name = 'job-combiner'
  AND prompt LIKE '%3. Push the feature branch%';
