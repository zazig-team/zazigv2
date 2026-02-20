---
name: repo-recon
description: Use when given a GitHub repo or directory URL to analyze for patterns, techniques, or architecture worth borrowing. Also use when revisiting a previously analyzed repo to see what has changed.
---

# Repo Recon

## Overview

Structured reconnaissance of a GitHub repo to find what's worth stealing for Zazig. Four phases: structure scan → pattern analysis → second opinion (Codex) → steal list. Saves a persistent report to `docs/research/` in the zazig repo.

## Setup (first time only)

```bash
mkdir -p ~/.cache/repo-recon
```

## Workflow

### Step 0: Ask which repos to compare against

Before cloning anything, ask the user:

> "Which Zazig codebases should I compare findings against?"

Present as a checklist. Default pre-ticked:
- [x] `zazig` — `~/Documents/GitHub/zazig` (https://github.com/zazig-team/zazig)
- [x] `zazigv2` — `~/Documents/GitHub/zazigv2` (https://github.com/zazig-team/zazigv2)

User may untick, add others, or say "just zazig".

---

### Step 1: Clone or update

Parse the GitHub URL. Extract `owner/repo` and optional subpath.

**Cache location:** `~/.cache/repo-recon/{owner}-{repo}/`

**Manifest file:** `~/.cache/repo-recon/{owner}-{repo}/manifest.json`

```json
{
  "url": "https://github.com/owner/repo",
  "subpath": "optional/subdir",
  "cloned_at": "ISO timestamp",
  "last_analyzed": "ISO timestamp",
  "commit_at_last_analysis": "abc123"
}
```

**New repo — clone:**
```bash
git clone --depth 1 https://github.com/owner/repo ~/.cache/repo-recon/owner-repo
cd ~/.cache/repo-recon/owner-repo
git rev-parse HEAD  # save to manifest
```

**Revisit — pull and diff:**
```bash
cd ~/.cache/repo-recon/owner-repo
PREV_COMMIT=$(jq -r .commit_at_last_analysis manifest.json)
git pull --depth 1
CURR_COMMIT=$(git rev-parse HEAD)
git diff $PREV_COMMIT..$CURR_COMMIT --stat  # show what changed
```

Tell the user: "Previously analyzed on `{last_analyzed}`. Here's what changed since then:" — then proceed with that context in mind.

If subpath specified, cd into it for all subsequent analysis.

---

### Step 2: Structure scan (Phase 1)

Quick orientation before going deep. Look at:
- `README.md` — what it is, what problem it solves
- Top-level directory tree (2 levels deep)
- `pyproject.toml` / `package.json` / `Cargo.toml` — deps and tooling
- Any `CONTRIBUTING.md`, `ARCHITECTURE.md`, `docs/` top level

Output: 1 paragraph summary — what this repo is, tech stack, rough size.

---

### Step 3: Pattern analysis (Phase 2)

Go deep. For each major subsystem, ask:
- What architectural choices were made here?
- What's notably clean, clever, or well-structured?
- What would be hard to do in zazig today that this makes easy?
- What do we already do better?

Focus areas (adapt based on repo type):
- Agent/session lifecycle management
- Concurrency and async patterns
- Tool/plugin architecture
- State persistence
- Error handling taxonomy
- Retry and resilience patterns
- Config and dependency injection
- Testing patterns

Build running notes. Don't write the report yet.

---

### Step 4: Second opinion (Phase 3)

**Required.** Invoke `/second-opinion` after your own analysis.

The second opinion should review your Phase 2 findings — not re-analyze from scratch. Frame it as: "Here's what I found — do you agree with these priorities? What did I miss?"

Codex will return an independent assessment. Note where it agrees, where it pushes back, and any patterns it surfaces that you missed.

---

### Step 5: Write the report (Phase 4)

Write the report to the zazig repo so it's versioned and visible to Chris:

```bash
~/Documents/GitHub/zazig/docs/research/{YYYY-MM-DD}-{owner}-{repo}.md
```

Use today's date for `{YYYY-MM-DD}` (e.g. `2026-02-19-tobi-qmd.md`).

The clone cache (`~/.cache/repo-recon/`) holds the git clone and manifest. The report goes in the repo.

**Report structure:**

```markdown
# Recon: {repo name}
*Analyzed: {date} | Commit: {short hash} | Compared against: {repo list}*

## TL;DR
5 bullets max. The most important things.

## Steal List
Ranked by impact for Zazig. For each item:
- **Pattern name** — what it is, why it matters, concrete borrowing plan

## We Do Better
Honest assessment. What zazig/zazigv2 does more cleanly.

## Architecture Observations
Broader notes — design philosophy, tradeoffs, notable decisions.

## Codex Second Opinion
Verbatim or summarized. Where it agreed, where it differed.

## Raw Notes
Everything else. Unranked observations, things to dig into later.
```

Update `manifest.json` with new `last_analyzed` and `commit_at_last_analysis`.

---

### Step 6: Present to user

Show the full report inline. Tell the user the report is saved at `docs/research/{YYYY-MM-DD}-{owner}-{repo}.md` in the zazig repo.

---

## Revisit Mode

When invoked with a repo that already has a manifest:
1. Pull and diff (Step 1)
2. Lead with "what changed" — new files, removed files, dep bumps
3. Re-run Phase 2 and 3 with the delta in mind
4. Append a new dated section to `docs/research/{YYYY-MM-DD}-{owner}-{repo}.md` rather than overwriting

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Browsing via GitHub API instead of cloning | Always clone to cache — enables revisit tracking |
| Skipping `/second-opinion` | Required. Do it before writing the report. |
| Framing output as "gaps" | Frame as "steal list" + "we do better" — both sides |
| Not asking which repos to compare against | Step 0, before anything else |
| Overwriting the report on revisit | Append a new section with date header |
| Deep-diving without structure scan | Phase 1 first — orientation saves time |
| Missing date prefix on filename | Always use `{YYYY-MM-DD}-{owner}-{repo}.md` format |
