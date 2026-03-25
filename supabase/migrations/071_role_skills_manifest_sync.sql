-- Sync role skill assignments with the 2026-02-28 skills manifest audit.
-- Adds missing skills to CPO and CTO persistent roles.
-- Removes brainstorming phantom (was never resolvable — file didn't exist in repo).
-- Now brainstorming exists in .claude/skills/brainstorming/SKILL.md.
-- Removes drive-pipeline (merged into standup).

-- CPO: standup, scrum, ideaify, internal-proposal, spec-feature, review-plan,
--       second-opinion, repo-recon, compound-docs, napkin, slack-headsup, brainstorming
UPDATE roles
SET skills = '{standup,scrum,ideaify,internal-proposal,spec-feature,review-plan,second-opinion,repo-recon,compound-docs,napkin,slack-headsup,brainstorming}'
WHERE name = 'cpo';

-- CTO: multi-agent-review, second-opinion, repo-recon, codex-delegate,
--       gemini-subagent, compound-docs, napkin, ship, slack-headsup, brainstorming
UPDATE roles
SET skills = '{multi-agent-review,second-opinion,repo-recon,codex-delegate,gemini-subagent,compound-docs,napkin,ship,slack-headsup,brainstorming}'
WHERE name = 'cto';

-- product_manager: unchanged (deep-research, second-opinion, repo-recon, review-plan, brainstorming)
-- brainstorming now resolves correctly since the file exists in the repo.

-- monitoring-agent: unchanged (internal-proposal, deep-research, x-scan, repo-recon)
-- x-scan stays here for now; future twitter-researcher role may absorb it.
