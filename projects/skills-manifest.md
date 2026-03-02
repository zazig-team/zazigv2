# Skills Manifest

Authoritative registry of all zazigv2 skills. Updated whenever skills are added, removed, or reassigned.

Last updated: 2026-03-02

---

## How distribution works

1. Each role has a `skills[]` array in the `roles` DB table
2. `zazig skills sync` reads the DB and symlinks matching files into workspace `.claude/skills/`
3. Skills resolve from two repo locations in order:
   - `projects/skills/{name}.md` (pipeline skills — flat file)
   - `projects/skills/{name}/SKILL.md` (pipeline skills — directory format)
   - `.claude/skills/{name}/SKILL.md` (interactive skills)
4. Symlinks mean content updates are instant; structural changes (new skill added to a role) require `zazig skills sync` or daemon restart

---

## Persistent exec skills

These are distributed to persistent agent workspaces via `zazig skills sync`.

### CPO

| Skill | Location | Purpose |
|-------|----------|---------|
| standup | projects/skills/ | Pipeline standup ceremony |
| scrum | projects/skills/ | Sprint planning ceremony |
| ideaify | projects/skills/ | Bulk idea processing (Steps 1-6 inline, Step 7 via contractor) |
| triage | projects/skills/ | Inbox triage ceremony — sweep new ideas, apply originator filtering, present promote/park/reject recommendations |
| internal-proposal | .claude/skills/ | Single-idea deep-dive into RFC doc |
| spec-feature | projects/skills/ | Write feature specs with AC |
| review-plan | .claude/skills/ | Review proposals before execution |
| second-opinion | .claude/skills/ | Cross-model validation on decisions |
| repo-recon | .claude/skills/ | Analyze external repos for patterns |
| compound-docs | .claude/skills/ | Capture problem-solution knowledge |
| napkin | .claude/skills/ | Session error tracking |
| slack-headsup | .claude/skills/ | Notify Slack after producing artifacts |
| brainstorming | .claude/skills/ | Structured design exploration before building |

### CTO

| Skill | Location | Purpose |
|-------|----------|---------|
| multi-agent-review | .claude/skills/ | Dispatch multi-perspective code review |
| second-opinion | .claude/skills/ | Cross-model validation on arch decisions |
| repo-recon | .claude/skills/ | Analyze external repos for patterns |
| codex-delegate | .claude/skills/ | Delegate implementation to OpenAI Codex |
| gemini-subagent | .claude/skills/ | Parallel research via Gemini |
| compound-docs | .claude/skills/ | Capture architectural knowledge |
| napkin | .claude/skills/ | Session error tracking |
| ship | .claude/skills/ | Commit, push, create PR workflow |
| slack-headsup | .claude/skills/ | Notify Slack after producing artifacts |
| brainstorming | .claude/skills/ | Structured design exploration before building |

---

## Ephemeral contractor skills

Distributed via `assembleContext` prompt injection and workspace copy for ephemeral jobs.

### product_manager

| Skill | Location | Purpose |
|-------|----------|---------|
| deep-research | .claude/skills/ | Research signals, market, competitors |
| second-opinion | .claude/skills/ | Cross-model validation |
| repo-recon | .claude/skills/ | Analyze repos for patterns |
| review-plan | .claude/skills/ | Review proposals/plans |
| brainstorming | .claude/skills/ | Structured design exploration |

### breakdown-specialist

| Skill | Location | Purpose |
|-------|----------|---------|
| jobify | projects/skills/ | Decompose features into jobs |

### project-architect

| Skill | Location | Purpose |
|-------|----------|---------|
| featurify | projects/skills/ | Decompose plans into features |
| plan-capability | projects/skills/ | Capability planning |

### verification-specialist

| Skill | Location | Purpose |
|-------|----------|---------|
| verify-feature | projects/skills/ | Feature acceptance testing |

### monitoring-agent

| Skill | Location | Purpose |
|-------|----------|---------|
| internal-proposal | .claude/skills/ | Write proposals from signals |
| deep-research | .claude/skills/ | Deep research tasks |
| x-scan | .claude/skills/ | Twitter/X scanning |
| repo-recon | .claude/skills/ | Analyze repos |

### senior-engineer

| Skill | Location | Purpose |
|-------|----------|---------|
| (none currently) | | Codex-based for now |

### code-reviewer

| Skill | Location | Purpose |
|-------|----------|---------|
| (none currently) | | |

---

## Pipeline-only skills (no role assignment needed)

These exist in `projects/skills/` and are used internally by the pipeline infrastructure.

| Skill | Purpose | Notes |
|-------|---------|-------|
| reconcile-docs | Doc reconciliation | Used by pipeline internally |

---

## Planned / future assignments

| Skill | Future role | Notes |
|-------|-------------|-------|
| build-with-agent-team | senior-engineer | After Codex transition |
| x-scan | twitter-researcher | New contractor role |
| x-to-md | twitter-researcher | New contractor role |
| deep-research | CPO (via contractor) | CPO commissions, doesn't run directly |

---

## Deleted skills

| Skill | Was in | Reason | Deleted |
|-------|--------|--------|---------|
| cpo | .claude/skills/ | Points to retired chainmaker system | 2026-02-28 |
| cto | .claude/skills/ | Points to retired chainmaker system | 2026-02-28 |
| cardify | .claude/skills/ | Replaced by features/jobs pipeline | 2026-02-28 |
| standalone-job | projects/skills/ | Replaced by request_work MCP tool | 2026-02-28 |
| drive-pipeline | .claude/skills/ | Merged into standup | 2026-02-28 |

---

## Not distributed (developer/personal tools)

These exist in the repo `.claude/skills/` but are not assigned to any pipeline role. Available to developers via Claude Code when working in the zazigv2 repo directly.

| Skill | Purpose |
|-------|---------|
| healthcheck | Zazig ecosystem diagnostics |
| init | Project scaffolding |
| new-exec | Create new exec team member (Tom-only) |
| last30days | Analytics tool |
| continuous-learning | Meta-skill for learning system |
| greenlight | App Store compliance scanner |
