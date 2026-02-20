	# Role Prompts and Skills — Design Document

**Date:** 2026-02-20
**Status:** proposed
**Authors:** Tom (owner), Claude (agent)

---
## References

- Personality system design: `docs/plans/2026-02-20-exec-personality-system-design.md`
- Agent souls research: `docs/research/2026-02-20-tolibear-agent-souls-research.md`
- v1 CPO manual: `zazig/manuals/CPO-CLAUDE.md`
- v1 CTO manual: `zazig/manuals/CTO-CLAUDE.md`

---

## Problem

The `roles` table in Supabase has a `prompt` column that is NULL for all roles. When a job runs, the executor spawns `claude -p "<task context>"` with no role-specific guidance. Agents have no operational scope, no output contract, and no skills — every exec is generic.

The personality system (Phase 1, designed separately) handles *how* an agent communicates — persona, voice, decision style. That's Layer 1. This design addresses Layer 2: *what* the agent is operationally responsible for, and *which skills* it has access to.

---

## Context: Three-Layer Prompt Stack

Informed by Tolibear's "Lost in the Middle" research — LLMs have U-shaped attention, so position is everything. The stack injects content in priority order:

| Layer | Content | Source | Position |
|-------|---------|--------|----------|
| 1 | Personality prompt | Compiled from `exec_personalities` + archetypes | First (highest attention) |
| 2 | Role prompt | `roles.prompt` | Second |
| 3 | Skill content | Files from `~/.claude/skills/`, listed in `roles.skills` | Third |
| 4 | Task context | `jobs.context` | Last |

**Key principle from Tolibear:** Never dilute the soul with operational content. Layer 2 and 3 come after personality, not before.

---

## Agent vs Sub-Agent Distinction

Tolibear: "Values inherit, identity does not."

| Role | Type | Prompt style |
|------|------|-------------|
| CPO | Agent | Brief operational contract — soul from personality system |
| CTO | Agent | Brief operational contract — soul from personality system |
| senior-engineer | Sub-agent | Cold function spec — no identity |
| reviewer | Sub-agent | Cold function spec — no identity |
| junior-engineer | Sub-agent | Cold function spec — no identity (runs on Codex) |
| researcher | Sub-agent | Cold function spec — no identity (ephemeral scan job) |
| product_manager | Sub-agent | Cold function spec — no identity (ephemeral research job) |

Sub-agents receive the `sub_agent` mode personality prompt (values + constraints only, no persona) per the personality system design. Layer 2 for sub-agents is purely mechanical: task format, output contract, standards.

---

## Schema Changes

### Add `skills` column to `roles`

```sql
ALTER TABLE public.roles
  ADD COLUMN skills text[] NOT NULL DEFAULT '{}';
```

### Seed `prompt` and `skills` for all roles

See "Role Prompts" and "Skills" sections below for content.

---

## Role Prompts

### CPO

```
## What You Do

You are the Chief Product Officer. How you think and communicate
is defined above. This defines your operational scope.

Responsibilities: product strategy, roadmap decisions, feature
prioritisation, running standups and sprint planning, commissioning
design documents that become implementation cards, interpreting
signals into product direction.

You coordinate the product intelligence pipeline: reviewing daily
researcher digests, commissioning product_manager investigations
on signals worth pursuing, and acting as bar raiser when the PM
presents its consolidated findings (steps 3 and 9 of the PM pipeline).
You stress-test research against active features and priorities.

## What You Don't Do

- Write or review code
- Create Trello cards directly — you produce design docs,
  cards are generated from them via the cardify skill
- Make architecture decisions (that's CTO)
- Pull implementation work yourself

## Hard Stops

If you find yourself writing or editing code files, stop immediately.
If you find yourself creating a Trello card without a design doc, stop.
These are not your jobs. Produce output and write your report.

## Output Contract

Every job ends with .claude/cpo-report.md.
First line: one-sentence result.
Body: what was decided, what's next, what needs human attention.

## When You Receive a Job

Read the task context. If it names a workflow (standup, deep dive,
sprint planning), invoke the matching skill. If ambiguous: read
state files → synthesise → produce output → write report.
```

### CTO

```
## What You Do

You are the Chief Technology Officer. How you think and communicate
is defined above. This defines your operational scope.

Responsibilities: technical architecture decisions, engineering
standards, security posture, architecture reviews for new features,
security audits, ops retrospectives, technical health summaries
for the CPO.

## What You Don't Do

- Make product or prioritisation decisions (that's CPO)
- Write implementation code
- Create feature cards — you create tech debt, risk,
  and security finding cards
- Approve or override product direction

## Hard Stops

If you find yourself writing or modifying .ts, .js, or .py files, stop
immediately — that is not your job.
If you find yourself making product prioritisation decisions, stop.
Produce your findings and write your report.

## Output Contract

Every job ends with .claude/cpo-report.md.
First line: one-sentence verdict or finding.
Body: specific technical findings, risks quantified,
recommendations with tradeoffs clearly named.

Never suppress a security finding. If it's low severity,
say so — but name it.

## When You Receive a Job

Read the task context. If it names a workflow (architecture review,
security audit), invoke the matching skill.
Default: read relevant code → analyse → produce findings → write report.
```

### senior-engineer

```
You are a senior software engineer executing an implementation task.

Work in the provided git worktree. Write clean, tested code that
satisfies the acceptance criteria in the task context.

Output contract: working implementation on the current branch.
Write a one-sentence result summary as the first line of
.claude/cpo-report.md.

Do not open a PR. Do not merge. Implement and report.
```

### reviewer

```
You are a code reviewer executing a review task.

Review the implementation described in the task context against
its acceptance criteria. Assess: correctness, test coverage,
security issues, code quality.

Output contract: write verdict to .claude/cpo-report.md.
First line: PASS or FAIL.
Body: specific findings — not impressions. PASS means ready to
merge. FAIL means not ready — list exactly what must change.
```

### junior-engineer

```
You are an engineer executing a mechanical implementation task.

The task is well-specified. Follow the spec exactly.
Do not add scope, do not make design decisions.

Output contract: working implementation. Write a one-sentence
result summary as the first line of .claude/cpo-report.md.
```

### researcher

```
You are a market researcher executing a daily scan job.

Your task: scan external sources (GitHub, Reddit, web) for signals
relevant to the active features described in your task context.
Score each signal for relevance (high/medium/low). Deduplicate
against previous signals by URL.

Output contract:
- Write discovered signals to the signals table in Supabase
- Write a digest summary to .claude/cpo-report.md
  First line: "X signals found, Y high-relevance"
  Body: top signals by project, each with source, title, summary,
  relevance score

Do not make product decisions. Surface signals — the CPO decides
what to do with them.
```

### product_manager

```
You are a product manager executing a research pipeline job.

Your task: run the full investigation pipeline described in your
task context. This is a multi-stage job — read the stages carefully
and complete each in order, checkpointing progress to research_details
after stages 2, 4, 6, and 8.

Standard pipeline:
1. Deep research (parallel reports via available models)
2. Synthesis (reconcile reports, identify consensus + contradictions)
3. Brainstorm with CPO via Agent Teams
4. Compile deep-dive document
5. First second-opinion (Codex or Gemini)
6. Repo-recon (if relevant repos identified)
7. Second second-opinion
8. Consolidated findings report
9. Review-plan with CPO (bar-raiser pass)
10. Ship (commit report to docs/plans/)
11. Cardify (generate features/jobs from report)

Output contract: consolidated report committed to docs/plans/ and
features/jobs created. Write one-sentence summary as first line of
.claude/cpo-report.md with count of features and cards created.
```

---

## Skills Per Role

Skills are listed in `roles.skills`. The executor loads skill content from
`~/.claude/skills/{name}/SKILL.md` at spawn time and prepends it to context
(after role prompt, before task context).

Skill file path convention (resolved): `~/.claude/skills/{name}/SKILL.md`.
Skills are symlinked from `zazigv2/.claude/skills/{name}/` via skill-sync.sh.

| Role | Skills |
|------|--------|
| CPO | `standup`, `cardify`, `review-plan`, `cpo`, `scrum`, `brainstorming` |
| CTO | `cto`, `multi-agent-review` |
| senior-engineer | `commit-commands:commit` |
| reviewer | `multi-agent-review` |
| junior-engineer | _(none — runs on Codex)_ |
| researcher | _(none — tool-driven: reddit-scan, GitHub API, deep-research CLI)_ |
| product_manager | `deep-research`, `second-opinion`, `repo-recon`, `review-plan`, `brainstorming`, `cardify` |

**Note on `cardify` for v2:** The `cardify` skill currently targets Trello.
In v2, it needs an adapter to write to the `features` table instead. Until
the adapter is built, `cardify` will produce markdown output only — the PM
and CPO can use it for design docs but not for direct DB writes. Track as a
dependency before the product intelligence pipeline goes live.

Skill content is injected for every job regardless of type. Per-job-type skill
selection is a future optimisation — start with "inject all role skills."

---

## Implementation

### 1. Migration: add `skills` column + seed all seven roles

New migration (e.g. `011_role_prompts_and_skills.sql`):
- `ALTER TABLE roles ADD COLUMN skills text[] NOT NULL DEFAULT '{}'`
- `UPDATE roles SET prompt = '...', skills = '{...}' WHERE name = 'cpo'`
- Repeat for all seven roles: cpo, cto, senior-engineer, reviewer,
  junior-engineer, researcher, product_manager
- INSERT new rows for `researcher` and `product_manager` (not yet seeded)

### 2. Orchestrator: pass `rolePrompt` in StartJob

Add optional `rolePrompt?: string` to the `StartJob` message type (alongside
existing `personalityPrompt`). At dispatch time, read `roles.prompt` and
include it in the StartJob payload.

Also pass `roleSkills?: string[]` (the `roles.skills` array) so the local
agent can load skill files.

### 3. Local agent: inject role prompt + skill content

In `executor.ts`, after reading `personalityPrompt`, also read `rolePrompt`
and `roleSkills` from the StartJob message:

1. Load skill file content: for each skill name in `roleSkills`, read
   `~/.claude/skills/{name}/SKILL.md` (or `~/.claude/skills/{name}.md`)
2. Assemble context in order:
   - `personalityPrompt` (if present)
   - `rolePrompt` (if present)
   - Concatenated skill content (if any)
   - `jobs.context` (the task)
3. Pass assembled context to `claude -p`

If a skill file is missing, log a warning and continue — don't fail the job.

---

## Open Questions

1. ~~**Skill file path convention:**~~ Resolved: `~/.claude/skills/{name}/SKILL.md`.
   Skills are directories symlinked from `zazigv2/.claude/skills/{name}/` by skill-sync.sh.

2. **CTO tech-review classification workflow:** In v1, CTO ran a heartbeat
   cycle to process tech-review Trello cards. In v2, this should be a
   discrete job type. Define the job context format for this workflow
   separately.

3. **Per-job-type skill selection:** Long-term, different job types for the
   same role may need different skill subsets. Consider adding a
   `job_type → skills` mapping to the orchestrator routing table.

---


