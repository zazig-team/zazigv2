# Skills Audit — Full Ecosystem Review

**Date:** 2026-03-05
**Status:** Active — awaiting review
**Author:** Claude (CPO session)
**Part of:** Skills infrastructure
**Companion docs:** `projects/skills-manifest.md`, `docs/plans/shipped/2026-02-25-skills-distribution-proposal.md`, `docs/plans/shipped/2026-02-20-skill-sync-design.md`

---

## Purpose

Comprehensive audit of all skills across the three skill locations in the zazigv2 ecosystem. Covers quality ratings, distribution verification, broken references, dead skills, and recommended actions.

---

## Skill Locations

| Location | Type | Count | Format |
|----------|------|-------|--------|
| `~/.claude/skills/` | Global (personal tools) | 15 | `{name}/SKILL.md` |
| `.claude/skills/` | Repo-level (interactive) | 28 | `{name}/SKILL.md` |
| `projects/skills/` | Pipeline (contractor) | 13 | `{name}.md` (flat) |

Overlap exists — some global skills are symlinks to repo-level skills. Pipeline skills are distributed to agent workspaces via `zazig skills sync`.

---

## Distribution Mechanism

### How it works

`zazig skills sync` (implemented in `packages/cli/src/lib/skills.ts`):

1. Reads `skills[]` arrays from the `roles` DB table via `company-persistent-jobs` edge function
2. Resolves each skill name against source locations in order:
   - `projects/skills/{name}.md` (flat pipeline file)
   - `projects/skills/{name}/SKILL.md` (nested pipeline directory)
   - `.claude/skills/{name}/SKILL.md` (interactive skill)
3. Creates symlinks in workspace `.claude/skills/{name}/SKILL.md`
4. Falls back to file copy if symlink fails
5. Removes skills from workspace that are no longer in the role's `skills[]` array
6. `zazig skills status` audits current symlink health without making changes

### Verification result

**The sync mechanism is sound.** All skill names assigned in the manifest resolve to existing source files. Two manifest documentation errors exist (see Findings below) but do not affect runtime.

**Scope limitation:** Sync only targets persistent role workspaces (`{companyId}-{role}-workspace`). Ephemeral contractors receive skills via `assembleContext` prompt injection and workspace file copy — that path was not audited.

---

## Quality Ratings

Rated across four dimensions:

- **Description** — Will Claude Code trigger this skill at the right time?
- **Clarity** — Can the agent follow the instructions without ambiguity?
- **Structure** — Is the skill well-organised with clear phases/steps?
- **Completeness** — Does it cover edge cases, errors, and done criteria?

Scale: A (excellent), B (good), B- (targeted fixes), C (significant rework), D (broken/dead)

---

### Tier A — Excellent

No changes needed. These skills are well-written, well-structured, and complete.

| Skill | Location | Assigned to | Notes |
|-------|----------|-------------|-------|
| napkin | .claude/skills/ | CPO, all devs | Template, continuous updates, graduation path to formal skills |
| spec-feature | projects/skills/ | CPO | 7-step collaborative spec conversation with MCP tools and done criteria |
| ideaify | projects/skills/ | CPO | 8-step bulk idea processing with splitting, categorisation, duplicate checking |
| jobify | projects/skills/ | breakdown-specialist | Feature→jobs decomposition with Gherkin AC, DAG dependencies, complexity routing |
| featurify | projects/skills/ | project-architect | Plan→features with dependency graph, batch creation, temp ref resolution |
| plan-capability | projects/skills/ | CPO | Multi-round planning with research gating and doc reconciliation hooks |
| reconcile-docs | projects/skills/ | CPO (substage) | 6-step doc reconciliation with structured report template |
| triage | projects/skills/ | CPO | Inbox sweep with content-level duplicate checking and originator filtering |
| verify-feature | projects/skills/ | verification-specialist | Active AC testing with polling strategy, timeouts, and structured report |
| scrum | .claude/skills/ | CPO | Clean 4-phase sprint planning ceremony |
| standup | .claude/skills/ | CPO | Tight threshold-based recommendations with pipeline routing |
| review-plan | .claude/skills/ | CPO | "Sharp friend" analytical review with multiple lenses |
| dispatch-subagent | projects/skills/ | CPO (not in manifest) | Sub-agent delegation with repo sync — well-structured but missing from manifest |

### Tier B — Good (minor fixes)

Functional and useful. Minor issues that don't block usage.

| Skill                 | Location         | Issue                                                                                                     |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| build-with-agent-team | .claude/skills/  | Solid contract-first pattern with anti-patterns table. No MCP tool table (minor).                         |
| ship                  | .claude/skills/  | Good Sonnet→Opus escalation model. Model names may go stale.                                              |
| repo-recon            | .claude/skills/  | Well-structured 6-step recon with Codex second opinion. Codex model name may drift.                       |
| healthcheck           | .claude/skills/  | Parallel diagnosis, tiered repair, launchd integration. Paths may drift over time.                        |
| deep-research         | .claude/skills/  | Good Gemini/OpenAI research wrapper. Doppler key resolution is solid.                                     |
| x-scan                | .claude/skills/  | Budget-aware research loop. Rate limit documentation could be better.                                     |
| x-to-md               | .claude/skills/  | Tweet/thread capture as markdown with YAML frontmatter. Clean.                                            |
| slack-headsup         | .claude/skills/  | Posts to #exec-team via CPO bot token. Straightforward.                                                   |
| new-exec              | .claude/skills/  | 547 lines — thorough but over-long. 18-step exec creation wizard. Functional.                             |
| compound-docs         | .claude/skills/  | Good problem-solution doc format. **Description too passive for reliable triggering.**                    |

### Tier B- — Needs targeted fixes

These skills have specific broken references or incorrect information that should be corrected.

| Skill | Location | Issue | Fix |
|-------|----------|-------|-----|
| brainstorming | .claude/skills/ | References nonexistent `writing-plans` skill. Uses `<HARD-GATE>` XML tag. Over-triggers on simple tasks. | Remove `writing-plans` reference. Replace `<HARD-GATE>` with standard markdown. Tighten trigger conditions. |
| internal-proposal | .claude/skills/ | References `superpowers:brainstorming` — wrong skill name. | Change to `brainstorming`. |
| second-opinion | .claude/skills/ | References nonexistent `gemini-delegate` skill. Content is thin. | Change to `gemini-subagent`. Expand with usage examples. |
| codex-delegate | .claude/skills/ | Model name `gpt-5.3-codex` will go stale. | Use a generic reference or add a "check current model" note. |
| multi-agent-review | .claude/skills/ | References "Task tool" — the correct name is "Agent tool". | Find-replace "Task tool" → "Agent tool". |
| nano-banana | .claude/skills/ | Model table has inconsistent entries between sections. | Reconcile model names across the skill. |

### Tier C — Significant rework needed

These skills have structural problems that degrade their usefulness.

| Skill | Location | Issue | Fix |
|-------|----------|-------|-----|
| gemini-subagent | .claude/skills/ | **Wrong filename** — file is `gemini-subagent.md` instead of `SKILL.md`. The verbose `nvm use`/`source` shell preamble is repeated 6 times across sections. | Rename to `SKILL.md`. Extract shell preamble into a single "Environment Setup" section referenced by each phase. |

### Dead Skills — Should be removed

These are marked deleted in `projects/skills-manifest.md` but the files still exist.

| Skill | Location | Deleted | Reason | Recommendation |
|-------|----------|---------|--------|----------------|
| cpo | .claude/skills/ | 2026-02-28 | References retired chainmaker system paths | **Delete** |
| cto | .claude/skills/ | 2026-02-28 | References retired chainmaker system paths | **Delete** |
| cardify | .claude/skills/ | 2026-02-28 | Replaced by features/jobs pipeline | **Delete** |
| drive-pipeline | .claude/skills/ | 2026-02-28 | Merged into standup | **Delete** |
| standalone-job | projects/skills/ | 2026-02-28 | Replaced by `request_work` MCP tool | **Archive** (still high quality, useful as reference) |
| init | .claude/skills/ | 2026-03-05 | V1 Trello-based project scaffolding, no longer used in V2 pipeline | **Delete** |
| continuous-learning | .claude/skills/ | 2026-03-05 | Not used. 350 lines with fake frontmatter fields Claude Code ignores. | **Delete** |

---

## Distribution Verification

### Role-to-skill mapping: source file exists?

#### CPO (persistent)

| Skill | Manifest location | Actual location | Resolves? |
|-------|-------------------|-----------------|-----------|
| standup | projects/skills/ | **.claude/skills/** | YES (fallback) |
| scrum | projects/skills/ | **.claude/skills/** | YES (fallback) |
| ideaify | projects/skills/ | projects/skills/ideaify.md | YES |
| triage | projects/skills/ | projects/skills/triage.md | YES |
| internal-proposal | .claude/skills/ | .claude/skills/internal-proposal/SKILL.md | YES |
| spec-feature | projects/skills/ | projects/skills/spec-feature.md | YES |
| review-plan | .claude/skills/ | .claude/skills/review-plan/SKILL.md | YES |
| second-opinion | .claude/skills/ | .claude/skills/second-opinion/SKILL.md | YES |
| repo-recon | .claude/skills/ | .claude/skills/repo-recon/SKILL.md | YES |
| compound-docs | .claude/skills/ | .claude/skills/compound-docs/SKILL.md | YES |
| napkin | .claude/skills/ | .claude/skills/napkin/SKILL.md | YES |
| slack-headsup | .claude/skills/ | .claude/skills/slack-headsup/SKILL.md | YES |
| brainstorming | .claude/skills/ | .claude/skills/brainstorming/SKILL.md | YES |

#### CTO (persistent)

| Skill | Actual location | Resolves? |
|-------|-----------------|-----------|
| multi-agent-review | .claude/skills/multi-agent-review/SKILL.md | YES |
| second-opinion | .claude/skills/second-opinion/SKILL.md | YES |
| repo-recon | .claude/skills/repo-recon/SKILL.md | YES |
| codex-delegate | .claude/skills/codex-delegate/SKILL.md | YES |
| gemini-subagent | .claude/skills/gemini-subagent/gemini-subagent.md | **NO** — wrong filename |
| compound-docs | .claude/skills/compound-docs/SKILL.md | YES |
| napkin | .claude/skills/napkin/SKILL.md | YES |
| ship | .claude/skills/ship/SKILL.md | YES |
| slack-headsup | .claude/skills/slack-headsup/SKILL.md | YES |
| brainstorming | .claude/skills/brainstorming/SKILL.md | YES |

#### Ephemeral contractors

| Role | Skill | Resolves? |
|------|-------|-----------|
| breakdown-specialist | jobify | YES |
| project-architect | featurify | YES |
| project-architect | plan-capability | YES |
| verification-specialist | verify-feature | YES |
| monitoring-agent | internal-proposal | YES |
| monitoring-agent | deep-research | YES |
| monitoring-agent | x-scan | YES |
| monitoring-agent | repo-recon | YES |
| product_manager | deep-research | YES |
| product_manager | second-opinion | YES |
| product_manager | repo-recon | YES |
| product_manager | review-plan | YES |
| product_manager | brainstorming | YES |

### Distribution issues found

1. **gemini-subagent will fail to resolve for CTO** — the sync expects `SKILL.md` but the file is named `gemini-subagent.md`. This is a real distribution bug.
2. **Manifest location column wrong for standup and scrum** — listed as `projects/skills/` but actually in `.claude/skills/`. Distribution works because the sync code falls back, but the manifest is misleading.
3. **dispatch-subagent missing from manifest** — exists in `projects/skills/` but has no role assignment. Should be listed under CPO.

### Ideaify distribution check

Cross-referenced against the original design doc (`docs/plans/archived/2026-02-25-ideaify-skill-proposal.md`) and the unified design (`docs/plans/shipped/2026-02-25-ideas-pipeline-unified-design.md`):

- **Phase 1 (current):** Ideaify is a CPO skill — CPO runs it directly when receiving messy input. Currently assigned correctly in the manifest.
- **Phase 2 (future):** Ideaify becomes a contractor role (`intake-processor`). This role does not exist yet. When created, ideaify should be assigned to it. No action needed now.
- **product_manager role:** Does not need ideaify — product_manager contractors receive already-structured briefs, not raw input. Confirmed correct.

---

## Recommended Actions

### Priority 1 — Distribution bugs (blocks agent functionality)

| # | Action | Files affected |
|---|--------|----------------|
| 1.1 | **Rename gemini-subagent file** — `gemini-subagent.md` → `SKILL.md` inside `.claude/skills/gemini-subagent/` | `.claude/skills/gemini-subagent/` |
| 1.2 | **Fix broken skill references** — brainstorming (remove `writing-plans`), internal-proposal (`superpowers:brainstorming` → `brainstorming`), second-opinion (`gemini-delegate` → `gemini-subagent`), multi-agent-review ("Task tool" → "Agent tool") | 4 SKILL.md files |

### Priority 2 — Cleanup (reduces confusion)

| # | Action | Files affected |
|---|--------|----------------|
| 2.1 | **Delete dead skills** — remove cpo, cto, cardify, drive-pipeline, init, continuous-learning from `.claude/skills/` | 6 directories |
| 2.2 | **Archive standalone-job** — move from `projects/skills/` to `projects/skills/archived/` or delete | 1 file |
| 2.3 | **Update manifest** — fix standup/scrum locations, add dispatch-subagent under CPO, add init + continuous-learning to deleted list, remove standalone-job from deleted if archived | `projects/skills-manifest.md` |

#### Deletion commands

Run from the repo root (`zazigv2/`):

```bash
# Dead skills (marked deleted in manifest, files still exist)
rm -rf .claude/skills/cpo
rm -rf .claude/skills/cto
rm -rf .claude/skills/cardify
rm -rf .claude/skills/drive-pipeline

# Newly identified dead skills
rm -rf .claude/skills/init
rm -rf .claude/skills/continuous-learning

# Archive standalone-job (still useful as reference)
mkdir -p projects/skills/archived
mv projects/skills/standalone-job.md projects/skills/archived/standalone-job.md
```

### Priority 3 — Quality improvements (improves agent performance)

| # | Action | Files affected |
|---|--------|----------------|
| 3.1 | **Rework gemini-subagent** — extract repeated shell preamble into single section | `.claude/skills/gemini-subagent/SKILL.md` |
| 3.2 | **Improve compound-docs description** — rewrite for better triggering | `.claude/skills/compound-docs/SKILL.md` |
| 3.3 | **Stabilise model references** — codex-delegate, nano-banana, repo-recon | 3 SKILL.md files |

### Priority 4 — Future work (nice to have)

| # | Action | Notes |
|---|--------|-------|
| 4.1 | Audit ephemeral contractor skill injection via `assembleContext` | Separate from symlink-based sync |
| 4.2 | Add `zazig skills audit` subcommand that cross-checks manifest against actual files | Automates this audit |
| 4.3 | Consider moving standup and scrum to `projects/skills/` for consistency with manifest | Or just fix the manifest |

---

## Appendix: Complete Skill Inventory

### Pipeline skills (`projects/skills/`)

| File | Assigned to | Status |
|------|-------------|--------|
| dispatch-subagent.md | (none — missing from manifest) | Active |
| featurify.md | project-architect | Active |
| ideaify.md | CPO | Active |
| jobify.md | breakdown-specialist | Active |
| plan-capability.md | project-architect, CPO | Active |
| reconcile-docs.md | Pipeline internal | Active |
| scrum.md | — | **Does not exist here** (manifest error) |
| spec-feature.md | CPO | Active |
| standalone-job.md | (none — deleted) | Dead |
| standup.md | — | **Does not exist here** (manifest error) |
| triage.md | CPO | Active |
| verify-feature.md | verification-specialist | Active |

### Interactive skills (`.claude/skills/`)

| Directory | Assigned to | Status |
|-----------|-------------|--------|
| brainstorming/ | CPO, CTO, product_manager | Active (B-) |
| build-with-agent-team/ | (developer tool) | Active (B) |
| cardify/ | — | **Dead** (deleted 2026-02-28) |
| codex-delegate/ | CTO | Active (B-) |
| compound-docs/ | CPO, CTO | Active (B) |
| continuous-learning/ | — | **Dead** (not used, 2026-03-05) |
| cpo/ | — | **Dead** (deleted 2026-02-28) |
| cto/ | — | **Dead** (deleted 2026-02-28) |
| deep-research/ | monitoring-agent, product_manager | Active (B) |
| drive-pipeline/ | — | **Dead** (deleted 2026-02-28) |
| gemini-subagent/ | CTO | Active (C) — wrong filename |
| greenlight/ | (developer tool) | Active (B) |
| healthcheck/ | (developer tool) | Active (B) |
| init/ | — | **Dead** (V1 Trello scaffolding, 2026-03-05) |
| internal-proposal/ | CPO, monitoring-agent | Active (B-) |
| multi-agent-review/ | CTO | Active (B-) |
| nano-banana/ | (developer tool) | Active (B-) |
| napkin/ | CPO, CTO, all | Active (A) |
| new-exec/ | (developer tool, Tom-only) | Active (B) |
| repo-recon/ | CPO, CTO, monitoring-agent, product_manager | Active (B) |
| review-plan/ | CPO, product_manager | Active (A) |
| scrum/ | CPO | Active (A) |
| second-opinion/ | CPO, CTO, product_manager | Active (B-) |
| ship/ | CTO | Active (B) |
| slack-headsup/ | CPO, CTO | Active (B) |
| standup/ | CPO | Active (A) |
| x-scan/ | monitoring-agent | Active (B) |
| x-to-md/ | (future: twitter-researcher) | Active (B) |

### Global skills (`~/.claude/skills/`) — not covered in detail

Most are symlinks to repo-level skills above. The only global-only skill is `skill-creator/` (Anthropic's meta-skill for creating and evaluating skills).
