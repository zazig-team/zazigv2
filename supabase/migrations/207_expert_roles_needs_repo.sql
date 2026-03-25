-- Add needs_repo flag to expert_roles.
-- When false, the expert session manager skips git worktree setup entirely.
-- Tool-only experts (triage-analyst, spec-reviewer) only use MCP tools
-- and have no need for a file checkout, so they can skip the 3+ minute
-- git clone + worktree flow and start in under 60 seconds.

ALTER TABLE expert_roles ADD COLUMN needs_repo BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE expert_roles SET needs_repo = FALSE WHERE name IN ('triage-analyst', 'spec-reviewer');
