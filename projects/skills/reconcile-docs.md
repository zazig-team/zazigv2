# /reconcile-docs

**Type:** CPO stage skill (planning substage)
**Stage:** 2. Planning — substage of `/plan-capability`
**Trigger:** CPO determines that the current plan touches multiple existing systems or design docs
**Unloads:** When reconciliation report is complete and the CPO resumes planning

---

## What This Skill Does

Guides you through documentation reconciliation — reading existing design docs, identifying where the new plan creates gaps or contradictions, updating affected docs, and reporting what changed. This prevents the documentation landscape from drifting out of sync with the actual design.

This is a substage of planning, not a standalone activity. You are either doing this yourself (lightweight reconciliation) or commissioning a contractor for deep reconciliation that requires codebase analysis or architecture review.

---

## When to Trigger

Invoke this skill when the plan being developed in `/plan-capability` meets ANY of these criteria:

- Modifies how two or more existing systems interact
- Supersedes or contradicts decisions in existing design docs
- Introduces a new pattern that changes how existing docs should be read
- Changes the relationship between existing projects or features

**Do NOT invoke for:**
- Greenfield capabilities with no existing dependencies
- Additive changes that don't modify existing system behaviour
- Trivial fixes (a single cross-reference update — just do it inline, no skill needed)

---

## Procedure

### Step 1: Identify affected docs

List every design doc that the new plan could affect. Start with these sources:

- **The plan itself** — what systems does it reference? What does it modify?
- **Companion doc references** — most design docs list related docs in their headers (see `Supersedes:` and `Companion docs:` fields)
- **The `docs/plans/` directory** — scan for docs covering systems the plan touches

For each doc, note:
- What it covers
- When it was last updated
- Whether the new plan directly contradicts, extends, or depends on it

**Decision point:** If more than 5 docs are affected, or if reconciliation requires codebase analysis (verifying whether code matches what docs describe), commission a research contractor or involve the CTO. Lightweight reconciliation (you reading and updating docs) is appropriate for 1-4 docs where the changes are primarily textual.

### Step 2: Read each affected doc

Read each doc in full. As you read, track three things:

**Contradictions** — statements in the existing doc that the new plan directly invalidates.
- Example: Doc says "the CPO breaks features into jobs." New plan says the Breakdown Specialist does this.
- These must be corrected.

**Open questions now resolved** — questions flagged as open in existing docs that the new plan answers.
- Example: Doc has "Open question: should features use Gherkin AC?" New plan establishes Gherkin at the job level, natural language at the feature level.
- These should be closed with the resolution.

**Gaps** — things the new plan assumes that no existing doc addresses.
- Example: New plan assumes a `commission_contractor` MCP tool exists. No doc describes this tool.
- These should be flagged — either the gap needs a doc update or a new doc.

### Step 3: Assess scope of changes

Before making any edits, assess what kind of reconciliation is needed:

| Situation | Action |
|-----------|--------|
| 1-3 contradictions, same doc | Fix inline — correct the statements, add a note about what changed |
| Open questions resolved | Close them — replace the question with the resolution and date |
| Cross-reference broken (doc renamed, section restructured) | Fix the link — update all docs that reference the moved content |
| Major contradiction across multiple docs | Write a reconciliation summary first, then update each doc |
| Pattern emerges across two designs | Consider whether it deserves its own section or doc — if the same pattern is described differently in two places, consolidate |
| Gap requires new content | Add the missing content to the most appropriate existing doc, or flag that a new doc is needed |

### Step 4: Make the updates

For each affected doc, apply the changes identified in Steps 2-3.

**Rules for editing existing docs:**

- **Preserve authorship.** Do not rewrite sections you're not changing. Edit the minimum necessary to resolve the contradiction or close the question.
- **Add reconciliation notes.** When correcting a contradiction, add a brief note: `> **Updated (date):** Corrected to reflect [new plan name]. Previous version said X; now Y because Z.`
- **Close open questions explicitly.** Replace `**Open question:**` with `**Resolved (date):**` and state the resolution.
- **Fix cross-references bidirectionally.** If Doc A references Doc B and the reference is stale, update both — Doc A's reference to Doc B and Doc B's reference (if any) back to Doc A.
- **Do not add speculative content.** Only update what the new plan definitively resolves. If something is still uncertain, leave it open.

### Step 5: Determine if new docs are needed

A new doc is warranted when:

- A pattern described in fragments across 2+ docs is important enough to be canonical
- The new plan introduces a concept with no home in existing docs
- The reconciliation reveals a topic complex enough that inline additions would overwhelm the host doc

If a new doc is needed, draft a stub with:
- Title and scope
- What it covers and why it exists
- Links to the docs it was extracted from
- Mark it as `Status: Stub — needs full write-up`

Do not write a full design doc during reconciliation. The stub is a placeholder that signals the need. Full authorship is a separate activity.

### Step 6: Produce the reconciliation report

Summarise everything you did. This report goes back to the CPO (if you are a contractor) or stays in your context (if you are the CPO doing this yourself). The report feeds into the plan being developed in `/plan-capability`.

**Report format:**

```markdown
## Documentation Reconciliation Report

**Plan:** [Name of the plan being developed]
**Date:** [ISO 8601]
**Docs reviewed:** [count]

### Contradictions Found and Resolved
- [Doc name]: [What was wrong] → [What it says now]
- ...

### Open Questions Closed
- [Doc name]: [Question] → [Resolution]
- ...

### Cross-References Fixed
- [Doc A] ↔ [Doc B]: [What was stale, what it says now]
- ...

### Gaps Identified
- [Description of gap] — [Where it should be addressed]
- ...

### New Docs Needed
- [Stub title]: [Why it's needed, what it covers]
- ...

### No Changes Needed
- [Doc name]: Reviewed, no issues found
- ...
```

Every doc you reviewed must appear in this report — either under a change category or under "No Changes Needed." If a doc was reviewed and found clean, say so. This prevents re-review later.

---

## Deciding Who Does the Work

| Reconciliation scope | Who does it |
|---------------------|-------------|
| 1-4 docs, textual changes only | CPO does it directly (you, right now) |
| 5+ docs, or changes require codebase verification | Commission a research contractor with this skill as context |
| Changes involve architecture decisions | Involve the CTO — architecture is their mandate, not yours |

If you commission a contractor, provide:
- The list of affected docs (from Step 1)
- The plan context (what's changing and why)
- This skill (so the contractor follows the same procedure)

The contractor returns the reconciliation report. You review it and incorporate findings into the plan.

---

## Doctrines to Apply

- **Documentation must be coherent before structuring begins.** This is why reconciliation exists. Stale docs cause downstream confusion when contractors and implementing agents reference them.
- **Fix what you find.** If you spot a problem in a doc that isn't directly related to the current plan, fix it anyway. Reconciliation is an opportunity to raise the baseline, not just address the immediate need.
- **Contradictions are more dangerous than gaps.** A missing doc is visible — someone asks "where's the doc for X?" A contradictory doc is invisible — someone reads it, trusts it, and builds the wrong thing. Prioritise resolving contradictions over filling gaps.
- **Cross-references rot faster than content.** Every time a doc is renamed, restructured, or superseded, cross-references in other docs go stale. Check them.

---

## Done Criteria

This skill is complete when ALL of the following are true:

1. Every affected doc has been identified and reviewed
2. All contradictions have been resolved in the source docs
3. All open questions that the new plan answers have been closed
4. All broken cross-references have been fixed
5. Gaps have been flagged (and stubs created if new docs are needed)
6. A reconciliation report has been produced listing every doc reviewed and every change made

If you reviewed zero docs and made zero changes, state that explicitly — "No reconciliation needed for this plan" — so the CPO knows the check was performed.

Return to `/plan-capability` and incorporate the reconciliation findings into the plan before proceeding to human approval.
