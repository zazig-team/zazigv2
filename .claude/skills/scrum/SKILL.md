---
name: scrum
description: Sprint planning ceremony — parallel squad reviews of Trello backlogs against roadmaps, CPO triage, present decisions to Tom. Use when Tom says "scrum", "sprint planning", or "what should we work on next".
---

# Scrum — Sprint Planning Ceremony

Review all focus project backlogs against their roadmaps. Identify what moves to "Up Next" for VP-Eng to execute.

## Phase 1: Parallel Squad Reviews

Read `~/.local/share/trw-projects/cpo-state.json` → `focusProjects` to get the active project list.

Launch **one Sonnet subagent per focus project** — all in parallel via the Task tool. Each subagent gets:

**Prompt template:**
```
You are the squad lead for {PROJECT_NAME}.

Read these files:
1. {PROJECT_DIR}/docs/ROADMAP.md (or docs/plans/ if no ROADMAP)
2. {PROJECT_DIR}/.project-status.md

Then read the Trello board:
3. Get all lists from board {BOARD_ID}
4. Get cards from the "Backlog" list
5. Get cards from "In Progress" list (to know what's already running)
6. Get cards from "Up Next" list (to avoid duplicates)

Analyze:
- What's the NEXT sequential phase per the roadmap that isn't already in progress or Up Next?
- Are there quick wins (small, unblocked, no design needed) in the backlog?
- Are any cards blocked or need human action?
- Are any cards stale (already done, or superseded)?

Return EXACTLY this format, max 5 items total:

## {Project Name}
- RECOMMEND: {card title} — {10 words on why now}
- RECOMMEND: {card title} — {10 words on why now}
- BLOCKED: {card title} — {what blocks it}
- DECISION: {card title} — {what Tom needs to decide}
- STALE: {card title} — {why it should be archived}

If backlog is empty or everything is blocked, say: "No dispatchable work."
```

**Board ID mapping:**

| Project | Directory | Board ID |
|---------|-----------|----------|
| ink | ~/Documents/GitHub/ink | 698da081c9e429bbfb793fef |
| marginscape (Marginally) | ~/Documents/GitHub/marginscape | 698da08110a5b7143027f73a |
| spine-platform | ~/Documents/GitHub/spine-platform | 698da08273c24f82e0ba2c1a |
| tbx-ios | ~/Documents/GitHub/tbx-ios | 698da08291deb191e8a57ea8 |
| athena | ~/Documents/GitHub/athena | 698da082c794c6412c8ae734 |
| charms | ~/Documents/GitHub/charms-at-citygate | 698da0835375ce7392a036e1 |
| pang | ~/Documents/GitHub/pang | 698da083d483990d53d82d47 |
| aida | ~/Documents/GitHub/aida | 698da2b37498e43e1e9b6c7c |
| quire | ~/Documents/GitHub/quire | 698e217ab215b5b171fadae4 |
| colophon | ~/Documents/GitHub/colophon | 698e0821aed8cd77e87f5628 |
| exec-team | ~/Documents/GitHub/trw-projects | 698f3d4dac52e8cd3a0de148 |

Only launch subagents for projects in the `focusProjects` list from cpo-state.json.

## Phase 2: CPO Triage

As squad reports come back, sort every item into three buckets using your product judgment:

**Greenlight** — Obviously correct. Next in sequence, unblocked, has enough spec. CPO approves without Tom.

**Decision needed** — Multiple valid options, priority call, or significant resource commitment. Tom decides.

**Blocked** — Can't move forward. Note the blocker so Tom knows.

### Triage rules:
- If a card is the next sequential phase in the roadmap AND the prior phase is done/merged → Greenlight
- If a card is a quick win (< 1 day, no design, no human dependency) → Greenlight
- If a card is a launch blocker (P0) but needs design decisions first → Decision
- If a card has a `needs-human` label → Blocked (unless Tom is present and can unblock now)
- If a card requires spending money (API keys, services, Apple Developer) → Decision
- Research tasks → Greenlight (they're cheap Sonnet subagents, low risk)

## Phase 3: Present to Tom

Show a clean decision board. No card IDs, no JSON, no Trello links. Just this:

```
## Sprint Planning

### Greenlighted (moving to Up Next)
- **{Project}**: {card title} — {one line reason}
- **{Project}**: {card title} — {one line reason}

### Decisions for You
1. **{Project}**: {card title} — {question or options}
2. **{Project}**: {card title} — {question or options}

### Blocked (FYI)
- **{Project}**: {card title} — {blocker}

### Stale (archiving)
- **{Project}**: {card title} — {reason}

**Total: X cards greenlighted, Y need your call, Z blocked.**
```

Wait for Tom's response. He may approve all, reject some, or add context.

## Phase 4: Execute Approvals

After Tom approves, delegate a **single Sonnet subagent** to:
1. Move all approved cards from Backlog to "Up Next" on their respective Trello boards
2. Archive any cards marked as stale (if Tom approved)
3. Add a comment to decision cards with Tom's answer (if he gave one)

CPO does NOT:
- Write task files
- Launch tmux sessions
- Dispatch implementation agents
- Move cards directly (always via subagent)

VP-Eng sees cards land in "Up Next" and takes over from there.

## Rules

- CPO NEVER reads Trello directly in-thread — always via subagents
- CPO NEVER writes to Trello directly — always via subagents
- Squad subagents return MAX 5 lines per project — enforce this in the prompt
- Total ceremony target: < 3 minutes
- Skip projects not in focusProjects
- If no subagent finds dispatchable work, say so and suggest Tom either unblock something or reprioritize
