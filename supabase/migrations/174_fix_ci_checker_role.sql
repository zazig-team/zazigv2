-- Migration 174: Fix ci-checker role — wrong model and slot_type
-- ci-checker is a Claude job (reads GitHub API, writes a report file),
-- not a Codex job. Opus is also excessive for this lightweight task.

BEGIN;

UPDATE public.roles
SET
  default_model = 'claude-sonnet-4-6',
  slot_type     = 'claude_code'
WHERE name = 'ci-checker';

COMMIT;
