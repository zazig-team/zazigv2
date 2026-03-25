-- Migration 180: Teach test-engineer to fix non-recursive test globs in package.json
--
-- Problem: new projects tend to ship with `node --test tests/*.mjs` which doesn't
-- recurse into tests/features/, so test-engineer-written tests never run in CI.
-- Fix: make the test-engineer responsible for verifying and patching the test script
-- before it finishes its job.

UPDATE public.roles
SET prompt = prompt || $$

## Verify Test Command Covers tests/features/

After writing test files, before writing your report:

1. Read `package.json` from the repo root
2. Find the `test` script
3. If it uses a non-recursive glob (e.g. `tests/*.mjs`, `tests/*.test.*`), update it to use a recursive glob:
   - `node --test tests/*.mjs`  →  `node --test 'tests/**/*.mjs'`
   - `node --test tests/*.test.mjs`  →  `node --test 'tests/**/*.test.mjs'`
   - If it delegates to a framework (vitest, jest) that already discovers recursively, no change needed
4. If you changed `package.json`, include that in your commit with the test files and note it in your report$$
WHERE name = 'test-engineer'
  AND prompt NOT LIKE '%Verify Test Command Covers tests/features/%';
