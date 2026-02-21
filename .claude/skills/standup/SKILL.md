---
name: standup
description: Use when starting a session, when Tom says "standup", "what's happening", "status", or "catch me up". Gathers wins, board state, PRs, blockers, and decisions across focus projects.
---

# Standup

Parallel data gather across all focus projects, synthesize into a concise status for Tom.

## Phase 1: Gather State (all in parallel)

Launch these simultaneously:

1. **Focus projects** — grep `focus: true` across `~/Documents/GitHub/*/.project-status.md`
2. **State files** — read `~/.local/share/trw-projects/cpo-standup.md` and `cpo-state.json` (skip if missing)
3. **Solomon Bridge** — check for Tom's responses and new ideas:
   - `trello-lite cards 698f61e6dee5f9a3a11df812` → "Tom Responded"
   - `trello-lite cards 698f61e65141890fafb8bcb8` → "From Tom"

## Phase 2: Parallel Project Scans

Launch **one Sonnet subagent per focus project** — all in parallel. Each gets:

```
You are scanning {PROJECT_NAME} for standup.

1. Read {PROJECT_DIR}/.project-status.md
2. Check open PRs: cd {PROJECT_DIR} && gh pr list --state open
3. Check Trello board using trello-lite:
   - trello-lite cards from "In Progress" list on board {BOARD_ID}
   - trello-lite cards from "Review" list
   - trello-lite cards from "Needs Human" list
4. Check git log for recent merges: git log --oneline --since="24 hours ago" main

Return EXACTLY this format:

## {Project Name}
- SHIPPED: {what merged in last 24h, if any}
- IN PROGRESS: {card titles, one line each}
- PRS: {open PR# — title — status (mergeable/conflicts/blocked)}
- NEEDS HUMAN: {what Tom must do}
- BLOCKED: {what's stuck and why}
- DECISIONS: {what Tom needs to decide}

Omit empty sections. Max 8 lines total.
```

**Board ID mapping** (same as scrum skill):

| Project | Directory | Board ID |
|---------|-----------|----------|
| marginscape | ~/Documents/GitHub/marginscape | 698da08110a5b7143027f73a |
| spine-platform | ~/Documents/GitHub/spine-platform | 698da08273c24f82e0ba2c1a |
| ink | ~/Documents/GitHub/ink | 698da081c9e429bbfb793fef |
| tbx-ios | ~/Documents/GitHub/tbx-ios | 698da08291deb191e8a57ea8 |
| athena | ~/Documents/GitHub/athena | 698da082c794c6412c8ae734 |
| charms | ~/Documents/GitHub/charms-at-citygate | 698da0835375ce7392a036e1 |
| pang | ~/Documents/GitHub/pang | 698da083d483990d53d82d47 |
| aida | ~/Documents/GitHub/aida | 698da2b37498e43e1e9b6c7c |
| quire | ~/Documents/GitHub/quire | 698e217ab215b5b171fadae4 |
| colophon | ~/Documents/GitHub/colophon | 698e0821aed8cd77e87f5628 |

Only scan projects from the focus list (Phase 1 result).

## Phase 3: Synthesize

Combine subagent reports + Solomon Bridge + state files into this format:

```
## Standup — {date}

**Wins since last standup:**
- {Project}: {what shipped/merged}

**Open PRs:**
- {Project} #{N}: {title} — {mergeable | conflicts | needs review}

**In progress:**
- {Project}: {card title}

**Decisions needed:**
1. {Project}: {question}

**Needs your attention:**
- {Project}: {what needs human action}

**Solomon Bridge:**
- {any responses from Tom or new ideas from "From Tom"}

**Focus projects:** {list}
```

Omit empty sections entirely. Keep total output under 30 lines.

## Rules

- Subagents return max 8 lines per project — enforce in prompt
- Use `trello-lite` for reads, never Trello MCP directly in thread
- Target: < 90 seconds total (parallel subagents are the bottleneck)
- If state files are fresh (< 2 hours), lean on them instead of full Trello scans
- Present and WAIT — Tom drives what happens next
