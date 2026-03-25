# Proposal Draft

Write the client-facing proposal content. This skill produces the sections — pricing is handled separately by proposal-pricing.

## Prerequisites

- `sales/{CLIENT_NAME}/docs/client-brief.md` must exist. If not, say: "No client brief found. Let me run client-research first." and load `client-research.md`.

## Process

### 1. Gather Context

Read (silently, don't narrate):
- `client-brief.md`
- Everything in `docs/meetings/` and `docs/input/`
- Any existing drafts in `docs/proposal-plans/`

### 2. Check Prior Proposals

Query the database for existing proposals:

```
SELECT id, title, client_name, content FROM proposals ORDER BY created_at DESC LIMIT 5;
```

Reuse standard sections that don't change between clients:
- **Team bios** (Tom Weaver, Chris Evans — adapt framing but keep facts)
- **The Zazig Platform** (autonomous execs positioning)
- **Built for Scale** (if applicable — adapt the specifics)

Only write client-specific sections from scratch.

### 3. Determine Engagement Type

If not obvious from the brief, ask:
> "What type of engagement is this? (a) Fully managed service — we run everything, (b) Advisory — guidance and oversight, (c) Project-based — specific deliverable with end date"

### 4. Draft Sections

Present each section for approval before moving to the next. Standard order:

1. **Executive Summary** — who we are, what we're offering, the headline value prop. 3-4 paragraphs max.
2. **The Opportunity** — framed in the client's own language. What's at stake, why now, what they lose by waiting.
3. **Pilot Sprint** — if applicable. Low-risk entry point. 2 weeks, zero cost, one deliverable.
4. **Phases** — as many as needed. Each phase: what's delivered, how it's managed (fully managed vs partially managed), key milestone.
5. **The Team** — Tom, Chris, Zazig Platform, Competitive Intelligence Analyst (if relevant). Pull from standard bios, adapt framing.
6. **Built for Scale** — if the client has scale ambitions. Reference Flyt experience (20K restaurant locations). Infrastructure at scale borne by client.
7. **Timeline** — milestone dates tied to the client's real deadlines.
8. **Next Steps** — clear CTA, reference the pilot sprint.

### 5. Personality

Use the CSO's active archetype:
- **Relationship Builder**: warm, consultative, "we" language, frames as partnership
- **Closer**: terse, numbers-forward, concrete timelines, urgency
- **Evangelist**: vision-led, storytelling, "imagine..." framing, paints the future

If you don't know which archetype is active, default to Relationship Builder.

## Output

Save to `sales/{CLIENT_NAME}/docs/proposal-plans/draft-v{n}.md` (increment version number if prior drafts exist).

## Guardrails

- Do NOT include pricing — that's proposal-pricing
- Do NOT set up the DB record — that's proposal-setup
- Frame everything in the client's language, not ours
- Anchor against the alternative cost when data exists (e.g. "the agency quoted $1.5M")
- Never fabricate capabilities or make timeline commitments without checking

## Handoff

When the draft is approved: "Draft complete. Ready to work on pricing? (loads proposal-pricing)"
