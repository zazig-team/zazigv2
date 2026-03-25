# Internal Proposal

Produce a structured internal proposal using the problem-hypothesis-solution framework, save it as a design doc, and track it in the ideas inbox.

## The Template

```
Problem
  Today: [status quo]
  Which is a problem, because: [why it's bad]
  What if?: [desired end state]

Hypothesis: [what you believe but needs proving]

Therefore: [one-line summary of the idea]

How this would work: [breakdown of mechanics / implementation]

We propose: [final short summary of what to build]
```

## Input Modes

### With context (brainstorm output, docs, notes)

Silently read all provided materials. Extract: pain point, desired end state, core bet, mechanism. Draft all sections. Present the full proposal, then ask for revisions.

If there's an existing design doc in `docs/plans/`, link to it from *How this would work*.

### Without context (starting fresh)

Ask one question at a time. Move to the next only after the user answers:

1. "What's the current situation you're frustrated with?" → *Today:*
2. "Why is that a problem? What does it cost to leave it as-is?" → *Which is a problem, because:*
3. "What would be true in the ideal world instead?" → *What if?:*
4. Draft a **Hypothesis** from what you've heard — confirm before continuing
5. Synthesize a **Therefore** (one-line bet) — confirm
6. "How would this actually work?" → *How this would work:*
7. Synthesize **We propose:** from everything above

Present the full draft after the walk-through. Iterate until approved.

If you don't have enough context to answer the early questions well, consider running `superpowers:brainstorming` first.

## Tips

- **"We propose" is the exec summary** — one or two sentences max, no hedging
- **Hypothesis ≠ Therefore** — Hypothesis is your unproven belief; Therefore is your conclusion *given* that belief
- **Don't over-spec "How this would work"** — enough to be credible, not a full PRD

## Output

### Step 1: Write the document

Save to: `docs/plans/YYYY-MM-DD-{topic}-proposal.md` (relative to your working directory)

### Step 2: Track in ideas inbox

After writing the document, call `create_idea` to create a tracking record:

| Field | Value |
|-------|-------|
| `title` | The proposal's "We propose" line (trimmed to 80 chars) |
| `description` | "Internal proposal: {topic}. Document at docs/plans/{filename}. {one-line summary of the hypothesis}." |
| `raw_text` | The full "We propose" paragraph |
| `originator` | `cpo` |
| `source` | `agent` |
| `tags` | `['proposal', 'design-doc', '{domain}']` where domain is product/engineering/marketing as appropriate |
| `priority` | Match the urgency implied by the problem statement — default `medium` |

This ensures every proposal is visible in the ideas inbox for triage, promotion, and tracking — not just a file sitting in git.
