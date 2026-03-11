-- Migration 141: Make reviewer report path absolute via git repo root
-- Patch only the report path instruction sections in the reviewer prompt.

UPDATE public.roles
SET prompt = replace(
  replace(
    prompt,
    'Write `.claude/reviewer-report.md` with this EXACT structure:',
    'Determine the repo root and write the report to an absolute path:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
mkdir -p "$REPO_ROOT/.claude"
# Write your report to: $REPO_ROOT/.claude/reviewer-report.md
```

This ensures the report is always written to the worktree root regardless of which subdirectory you navigate to during review.

Write `$REPO_ROOT/.claude/reviewer-report.md` with this EXACT structure:'
  ),
  'The report filename is `.claude/reviewer-report.md` — not `.claude/verify-report.md`',
  'The report filename is `$REPO_ROOT/.claude/reviewer-report.md` (derive `REPO_ROOT` via `git rev-parse --show-toplevel`) — not `.claude/verify-report.md`'
)
WHERE name = 'reviewer'
  AND (
    prompt LIKE '%Write `.claude/reviewer-report.md` with this EXACT structure:%'
    OR prompt LIKE '%The report filename is `.claude/reviewer-report.md`%'
  );
