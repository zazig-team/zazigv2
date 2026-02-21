# Card Lifecycle Process
**Date:** 2026-02-21
**Status:** Draft — Stage 2 (creation, scrum, and execution gaps mapped; V2 execution flow TBD)
**Authors:** Tom Weaver, Claude

---

## Purpose

This document maps the intended card lifecycle for the exec team system — from idea to Done — across two contexts:

- **Zazig v1:** Current setup. Shared Trello boards, VP-Eng agents pulling and executing cards.
- **Zazig v2:** No VP-Eng. Human executor (Tom / Chris). Different execution flow needed.

Gaps are called out inline.

---

## Part 1: Zazig V1 — With VP-Eng

### Stage 1: Creation

**Intended chain:**

```
[Idea / Problem]
    → Brainstorm (/brainstorming skill, CPO + owner in-thread)
    → Design Doc (committed to docs/plans/{date}-{name}.md)
    → /review-plan (CPO reviews the doc before generating cards)
    → /cardify (generates .cards.md, pushes to Backlog)
```

**Exception path — roadmap health:**
The CPO's daily roadmap health check may generate cards via `/cardify` without a full design doc, using the roadmap phase description as the source. These cards get the `cpo-generated` label for owner review before scrum.

**Rules:**
- All new backlog cards must come from a `/cardify` run on a source document
- Ad-hoc card creation directly in Trello is not permitted
- The chain is: Brainstorm → Design Doc → review-plan → cardify. Never skip the doc or the review.
- Cards created via roadmap health subagent also go to Backlog only — never straight to Up Next

**Gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 1 | `/review-plan` is not enforced before `/cardify` runs — purely a convention | Medium |
| 2 | Nothing prevents ad-hoc Trello card creation — no mechanical gate | Medium |

---

### Stage 2: Grooming

Backlog cards sit until scrum. CPO reviews daily via roadmap health check (parallel subagents, one per focus project). No formal "ready for scrum" criteria beyond the preflight check at scrum time.

**Preflight criteria (checked at scrum, not at creation):**
- No forbidden labels: `design`, `blocked`, `needs-human`, `tech-review`
- Has a clear description and acceptance criteria
- If a design doc was produced, it is linked in a card comment

**Gap:**

| # | Gap | Severity |
|---|-----|----------|
| 3 | No formal readiness check at card creation — eligibility is only verified at scrum time, so bad cards can sit in Backlog undetected | Low |

---

### Stage 3: Scrum

**Invoked by:** owner saying "scrum", or CPO deciding pipeline needs filling.

**Flow:**
1. CPO launches one Sonnet subagent per focus project in parallel
2. Each subagent reads ROADMAP.md + Trello backlog, recommends what to move to Up Next
3. CPO triages: greenlights obvious ones, surfaces decisions for the owner
4. Owner approves
5. Single subagent moves approved cards to Up Next:
   - Runs preflight check
   - Adds `assigned-{instance}` label on shared boards (e.g. `assigned-tom`, `assigned-chris`)
   - Instance-scoped boards do not need assignment labels

**Assignment label rules (shared boards only):**
- Every card moved to Up Next on a shared board MUST have an `assigned-{instance}` label
- CPO assigns at scrum time — VP-Eng does not assign; it only reads
- Untagged cards on shared boards are ineligible for any VP-Eng (fail-closed)
- Cards failing preflight stay in Backlog; the issue is surfaced at standup

**Gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 4 | Assignment label is prompt-enforced only — the step was missed on 3 cards (2026-02-21 incident) | High |
| 5 | When a card fails preflight, it stays in Backlog silently with no visible reason — owner doesn't know without asking | Low |

---

### Stage 4: Execution

**Flow:**
1. VP-Eng scans shared boards for Up Next cards:
   - Card has **another instance's** `assigned-{x}` label → skip
   - Card has **your** `assigned-{instance}` label → eligible, claim it
   - Card has **no** assignment label → skip (fail-closed)
2. VP-Eng moves card to In Progress, writes task spec, dispatches agent
3. Agent works in a branch (`{instance-id}/{feature-description}`)
4. Agent writes `cpo-report.md`, creates PR
5. VP-Eng runs QA (multi-agent review), posts completion comment to card, moves card to Review

**Completion comment (required, posted by VP-Eng when moving to Review):**

This is the per-card audit trail. Without it, a Done card is an empty record — no visibility into what happened, what merged, or what state the system is in. The gold standard is card 1 (pre-migration, written manually): PR link, commit hashes, test results, QA findings, recommendation.

VP-Eng must post a comment in this format when moving a card to Review:

```
✅ COMPLETE — PR #{number} created
{PR URL}

**Delivered:**
- {commit or file summary — specific, not vague}

**Test results:**
- {pass/fail counts, tool results}

**Code review ({N} agents):**
- 🔴 CRITICAL: {finding}
- 🟡 HIGH: {finding}
- 🟠 MEDIUM: {finding}

**Recommendation:**
{Merge as-is / Merge with follow-up / Hold — and why}
```

If QA was skipped (e.g. codex-first mechanical card), the comment still requires at minimum: PR link, what was delivered, test results.

**Gaps:**

| # | Gap | Severity |
|---|-----|----------|
| 6 | VP-Eng silently skips untagged cards — should surface them at standup instead | Medium |
| 7 | VP-Eng currently moves cards to Review/Done without posting a completion comment — cards like card 4 (role prompts migration, 2026-02-20) show Done with zero audit trail | High |

---

### Stage 5: Review and Done

1. CPO reads `cpo-report.md`, synthesizes QA results, presents to owner at standup or review session
2. Owner reviews PR (code review or manual acceptance test)
3. Approved → CPO moves card to Done via subagent, merges PR
4. Rejected → CPO creates fix card with owner's feedback, VP-Eng dispatches fix

**The PR as the richest artifact:**

The pull request contains more information about what was built than anything else in the system: the description (what + why), commit list, CI results, QA review comments, and the exact diff. Once merged, all of this lives only on GitHub. There is currently no local record of what was in the PR — the Trello card has a pre-merge completion comment, but nothing captures the PR body or post-merge state locally.

In a real startup, the PR description IS the completion record. Engineers write it to describe what they built; reviewers read it to understand what to approve; PMs read it to know what shipped. It's the canonical "here's what happened" artifact.

**Gap 9 — PR content not captured locally:** After merge, nothing writes the PR description or key metadata to a local file. The `.cards.md` completion section (Gap 8) is the right home — when VP-Eng creates a PR, it should pre-populate the completion section with the PR body. After merge, a subagent adds the merge commit SHA and timestamp.

**Batch completion narrative (Gap 8 + 9 combined):**

When the last card in a `.cards.md` batch is Done, VP-Eng (or a CPO subagent) appends a `## Completion` section to the `.cards.md` file. This section draws from the PR descriptions and the per-card completion comments written during execution:

```markdown
## Completion
**Completed:** {ISO 8601 date}
**Cards shipped:** {list of card IDs}

| Card | PR | Merge commit |
|------|----|--------------|
| {ID} -- {title} | #{number} {URL} | {SHA} |

### What we now have

{Plain English. 2–4 paragraphs. Written for someone who didn't read the design doc.
Not implementation detail. Answer: what can the system do now that it couldn't before?
What was the before state, what is the after state, what does this unlock?
Draw from the PR descriptions — they already contain this narrative.}

### PR summaries
{For each PR: paste the PR body verbatim or a condensed version. This is the local record
of what the PR said, so you can read it without going to GitHub.}

### Known gaps / follow-ups
{Any issues surfaced during execution that weren't fixed — link to follow-up cards if created}
```

This keeps the full story in one place: design intent (the source doc) → card structure (`.cards.md` Phase 1) → execution outcome (`.cards.md` Completion section, populated from PR descriptions after merge). You can read the file linearly from spec to shipped without ever going to GitHub or Trello.

---

### V1 Gap Summary

| # | Stage | Gap | Severity | Fix direction |
|---|-------|-----|----------|---------------|
| 1 | Creation | `/review-plan` not enforced before `/cardify` | Medium | CPO manual: require review-plan link in card comment before cardify |
| 2 | Creation | Ad-hoc Trello card creation bypasses Cardify | Medium | CPO manual rule: all cards must come from a cardify run on a doc |
| 3 | Grooming | No readiness check at creation time | Low | Nice to have |
| 4 | Scrum | Assignment label is prompt-only — missed in practice | High | CPO manual hardening (in progress) |
| 5 | Scrum | Failed preflight cards are silent | Low | Nice to have |
| 6 | Execution | VP-Eng silently skips untagged cards | Medium | VP-Eng reports untagged cards in standup summary |
| 7 | Execution / Review | VP-Eng moves cards to Review/Done without posting a completion comment — no per-card audit trail | High | VP-ENG-CLAUDE.md: mandate completion comment format before moving to Review |
| 8 | Done | No batch completion narrative — when a group of related cards ships, "what did we build?" has no answer | High | VP-Eng or CPO subagent appends `## Completion` section to `.cards.md` when last card in batch is Done |
| 9 | Done | PR content (description, CI results, review comments) is never captured locally — lives only on GitHub, invisible after merge | High | `.cards.md` Completion section includes PR body verbatim + merge commit SHA. VP-Eng pre-populates at PR creation time; subagent finalises after merge. |

---

## Part 2: Zazig V2 — No VP-Eng

### Context

Zazig v2 will not have a VP-Eng agent. Cards are executed by a human (Tom or Chris) picking them up directly. The assignment label → VP-Eng claim flow does not apply.

The stages up through Scrum are largely the same. Execution and handoff differ entirely.

---

### Stages 1–3: Same as V1

Creation, Grooming, and Scrum follow the same process. The `/cardify` → Backlog → scrum → Up Next chain is identical.

**One difference at Scrum:** `assigned-{instance}` labels still make sense for coordination between Tom and Chris (so each knows which cards are theirs), but they are human-read only — no agent enforces or acts on them.

---

### Stage 4: Execution (V2)

**Open questions — not yet designed:**

- Who "owns" moving a card to In Progress? Human picks it up manually from Up Next?
- How does a human executor signal that work is in progress vs. blocked vs. waiting for review?
- Is there a cpo-report equivalent for human-executed work? Or does the human write a summary?
- Does the card move to Done immediately after merge, or is there still a CPO review step?
- How does the owner's work get tracked across sessions (no VP-Eng state files)?

**Tentative flow (to be validated):**

```
Owner/collaborator picks card from Up Next (manually or via /scrum)
    → Moves card to In Progress
    → Works in branch ({instance-id}/{feature-description} convention still applies)
    → Creates PR
    → Moves card to Review
    → Notifies CPO (how? Standup? Card comment? Direct message?)
    → CPO presents at standup
    → Owner approves → Done
```

**Gaps (to be designed):**

| # | Stage | Gap |
|---|-------|-----|
| V2-1 | Execution | No defined mechanism for human to claim a card and signal active work |
| V2-2 | Execution | No state file equivalent — CPO has no structured way to know what's in flight |
| V2-3 | Execution | No defined handoff from "card done" to "CPO aware" without VP-Eng standup file |
| V2-4 | Scrum | Assignment labels are human-read — is this sufficient, or do we need a different coordination mechanism? |

---

### Next Steps

1. **Immediate:** Harden CPO manual for Gap 4 (assignment label at scrum) — already agreed
2. **Immediate:** Update VP-ENG-CLAUDE.md to mandate completion comment (Gap 7) and trigger batch narrative (Gap 8)
3. **Immediate:** Update Cardify skill to define the `## Completion` section format (Gap 8)
4. **Later:** Design V2 execution flow (Stage 4+) — needs a separate conversation

---

## Orchestrator Implications

**See:** `2026-02-21-orchestrator-trello-replacement-requirements.md` for the full technical schema.

The process gaps identified in this document map directly to orchestrator requirements. The interim fixes (updating agent manuals + Cardify skill) solve the symptom in the current Trello system; the orchestrator must solve the root cause by making these first-class data structures.

| Process Gap | Interim fix (Trello) | Orchestrator requirement |
|-------------|---------------------|--------------------------|
| **Gap 4** — assignment label not stamped at scrum | CPO manual hardening | `Task.assignment` field set at scrum; routing rules enforced declaratively — agents can't accidentally pull unassigned tasks |
| **Gap 6** — VP-Eng skips untagged cards silently | VP-ENG-CLAUDE.md: surface in standup | Orchestrator rejects queries for unassigned tasks on shared projects at the API level |
| **Gap 7** — no per-card completion audit trail | VP-ENG-CLAUDE.md: mandate completion comment format | First-class `TaskEvent` type `"completion"` with structured QA fields — not free-form comment text. Reliably parseable by agents, rendered for founder. |
| **Gap 8** — no batch/feature completion narrative | Cardify skill: `## Completion` section in `.cards.md` | First-class `BatchCompletion` record linked to source document — queryable, durable, not buried in a markdown file |
| **Gap 1** — review-plan not enforced before cardify | Convention only | Orchestrator can require a `source_doc_reviewed: bool` flag on batch task creation — Cardify sets it, enforced at push time |
| **Gap 2** — ad-hoc card creation bypasses Cardify | Convention only | Orchestrator can enforce that all tasks carry a `source_doc` reference — no orphan tasks without a traceable origin |
| **Gap 9** — PR content not captured locally after merge | `.cards.md` Completion section includes PR body + merge SHA | `BatchCompletion.pr_snapshots`: list of `{pr_number, title, body, merge_commit, merged_at}` stored server-side at merge time — no manual capture needed |
