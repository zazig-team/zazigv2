---
name: review-plan
description: |
  Use when reviewing an existing plan, design doc, or proposal before execution.
  Also use when someone says "review this plan", "stress test this design",
  "what are the implications", "check this before we build", or points to a
  docs/plans/*.md file and wants analysis before turning it into action items.
---

# Review Plan

Analyze an existing plan or design document before committing to execution.
Walk through it interactively, surface implications, dependencies, one-way
doors, and trade-offs — then produce a summary report.

**Sits between writing a plan and executing it.** Use this before cardify.
If you create the wrong cards in the first place, it's all wrong.

## Flow

```
brainstorming → write plan → REVIEW-PLAN → cardify → implement
```

## Phase 1: Context Gathering

### Identify the plan

Either:
- User provides a file path → read it
- User describes the plan verbally → work from conversation

### Gather project context (silently)

Read these if they exist — internalize, don't dump on the user:
- `docs/ROADMAP.md` — bigger picture this plan fits into
- Other files in `docs/plans/` — adjacent plans, overlaps, conflicts
- `.project-status.md` — current state
- `AGENTS.md` — project constraints

### Ask one framing question

> "What's the main thing you want to get right? Anything you're already uncertain about?"

This focuses the analysis. User worried about database choice → deeper scrutiny there. "Just review it broadly" → even coverage.

## Phase 2: Interactive Walkthrough

Go section by section. For each, present a short analysis (200-300 words) using whichever lenses apply:

### Analytical Lenses

- **Dependencies** — What does this require that doesn't exist yet? What breaks if this changes? "Feature Y needs X — if you cut X, Y is dead."
- **One-way doors** — Decisions that are hard/expensive to reverse. Database choices, public API contracts, pricing models, data schema users will populate. Tag: `ONE-WAY DOOR` or `HARD TO REVERSE`.
- **Assumptions** — What is this assuming that might not be true? Unstated prerequisites, market assumptions, technical assumptions.
- **Trade-offs** — What are you gaining and giving up? Alternatives the plan didn't consider?
- **Conflicts** — Does this contradict the roadmap, another plan, or current project state?
- **Gaps** — What's missing? Error cases, edge cases, "what happens when this fails?"

### After each section, ask one question

Examples:
- "The Postgres choice here is a one-way door. Have you considered whether SQLite would work for your scale?"
- "This depends on the auth system from the Feb 14 plan — is that definitely happening?"
- "I see a gap around error handling when the webhook fails. Intentional deferral or oversight?"

**One question per section. Keep it conversational, not checklist-y.** The value is in the dialogue.

## Phase 3: Summary Report

After the walkthrough, produce a structured report.

### Report template

```markdown
# Review: {plan name}
Reviewed: {date}
Source: {path to original plan}

## Verdict
One paragraph: ready to execute, needs revision, or needs rethinking?

## One-Way Doors
| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| Example: Postgres as primary DB | Data Layer | ONE-WAY DOOR | Migration cost high once users populate |

## Dependency Map
| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| Auth system | 2026-02-14 auth design | In progress |
| Stripe integration | Not planned yet | GAP |

## Key Trade-offs
- Chose X over Y: gains {benefit}, loses {cost}

## Open Questions
Issues surfaced during walkthrough that need answers before execution.

## Suggested Revisions
Concrete changes to the plan based on the review.
```

### Save and next steps

Save to `docs/plans/YYYY-MM-DD-{plan-name}-review.md` alongside the original.

Then ask: **"Ready to proceed to cardify, or revise the plan first?"**

## Guardrails

**This skill is NOT:**
- A rubber stamp — every plan has blind spots, find them
- A rewrite — suggest revisions, don't produce an alternative
- A blocker — flag risks, don't demand perfection

| Temptation | Do this instead |
|------------|-----------------|
| "Looks great, no issues!" | Push harder — check assumptions, find gaps |
| Rewriting the plan | Suggest specific revisions, let the user decide |
| Flagging everything as one-way | Reserve the tag for genuinely irreversible choices |
| 20 questions per section | One question per section, move on |
| Ignoring project context | Always read roadmap + adjacent plans first |
| Generic feedback ("consider error handling") | Be specific: "What happens when the Stripe webhook returns 500 three times?" |

**The spirit:** Be the sharp friend who reads your plan over coffee and says "have you thought about..." — not a committee review board.
