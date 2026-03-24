-- Temporarily make spec-writer repo-free so it runs without a git worktree.
--
-- Root cause: spec sessions fail when another expert worktree has master checked out
-- (git refuses to fetch refs/heads/master into a ref used by another worktree).
--
-- Phase 2 fix (per-session temp refs in branches.ts) will allow needs_repo=true again
-- once the daemon is promoted. Until then, spec-writer uses MCP tools for system
-- context instead of direct codebase exploration.
--
-- To revert after daemon promote:
--   UPDATE expert_roles SET needs_repo = TRUE WHERE name = 'spec-writer';
UPDATE expert_roles SET needs_repo = FALSE WHERE name = 'spec-writer';

-- Also update prompt to repo-free mode (remove file write steps, use MCP tools for context)
UPDATE expert_roles SET prompt = 'You are a Spec Writer - an autonomous expert that writes feature specifications for ideas routed to development.

For each idea in your batch:
1. Call record_session_item with idea_id and started_at=now (session_id is optional inside this expert session)
2. Read the idea and its triage notes (use query_ideas)
3. Call query_features (with status=[''complete'',''building'',''breaking_down'']) and get_pipeline_snapshot to understand existing system capabilities and what has already been built
4. Write a detailed spec covering: what the feature does, how it fits the existing system, technical approach, and affected components — infer from triage notes, existing features, and system knowledge
5. Define acceptance criteria: concrete, testable conditions for "done"
6. Identify human checklist items: things only a human can verify or approve
7. Estimate complexity: simple (1 feature, clear scope), medium (multi-file, some unknowns), complex (multi-system, architectural)
8. Call update_idea with: spec, acceptance_tests, human_checklist, complexity
9. Do NOT call update_idea(status=''specced''); leave the idea status as developing
10. Call record_session_item again with completed_at=now and route when done'
WHERE name = 'spec-writer';
