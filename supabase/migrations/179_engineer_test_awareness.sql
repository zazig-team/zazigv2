-- Append test-awareness guidance to engineer role prompts.
UPDATE public.roles
SET prompt = prompt || $$

## Test-Driven Development
Before writing code, check `tests/features/` on your branch for pre-written feature tests. If they exist:
- Read them to understand what the feature must do
- Your implementation must make these tests pass
- Run the tests after implementation to verify they pass
- Do NOT write your own feature-level tests - a test-engineer has already written them
- You may still write unit tests for individual functions if needed$$
WHERE name IN ('junior-engineer', 'senior-engineer')
  AND prompt NOT LIKE '%Before writing code, check `tests/features/` on your branch for pre-written feature tests.%';
