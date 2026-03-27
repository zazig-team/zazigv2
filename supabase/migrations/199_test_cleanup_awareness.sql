-- Add test cleanup awareness to ci-checker and engineer roles.
-- ci-checker: treat stale tests (referencing removed/renamed components) as fixable, not code issues.
-- engineers: clean up tests that reference components you're replacing.

BEGIN;

-- ci-checker: expand what counts as a "setup/config issue" to include stale tests
UPDATE public.roles
SET prompt = REPLACE(
  prompt,
  '   - **Code issue**: test assertions failing, type errors in source code, runtime errors in application logic',
  '   - **Stale test issue**: tests that import or reference components/files that no longer exist after a merge
     (e.g. ''Cannot find module'', ''is not exported from'', references to deleted files). This happens when
     multiple branches are combined and one branch removes something another branch tested. Treat this as
     a **setup issue** — delete or update the stale tests, commit, and push.
   - **Code issue**: test assertions failing, type errors in source code, runtime errors in application logic'
)
WHERE name = 'ci-checker';

-- engineers: when replacing/removing components, clean up related tests
UPDATE public.roles
SET prompt = prompt || $$

## Test Cleanup
When you rename, replace, or remove components/files, check for existing tests that reference them:
- Search `tests/` and `__tests__/` for imports of the old component names
- Delete or update tests that reference things you removed
- Do NOT leave behind tests that import non-existent modules — they will break CI on merge$$
WHERE name IN ('junior-engineer', 'senior-engineer')
  AND prompt NOT LIKE '%Test Cleanup%';

COMMIT;
