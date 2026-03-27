# Client Research

Ingest and organise information about a prospective client. Produce a client brief that all downstream skills will read.

## Mode 1: Organise a Dump

Someone has dropped files into `sales/{CLIENT_NAME}/` (or told you where they are).

1. Scan all files — identify types:
   - **Transcripts/meeting notes** → `docs/meetings/`
   - **Client documents** (briefs, requirements, pitch decks) → `docs/input/`
   - **Brand assets** (logos, colours, fonts, design files) → `docs/brand/`
   - **Large external assets** (>10MB, video, photo libraries) → don't copy. Create `docs/external-assets.md` with the path.
2. Move/copy files into the standard structure
3. Read everything and produce the client brief (see Output below)

## Mode 2: Research from Scratch

Given a client name, website, LinkedIn, or other starting point.

1. Use `deep-research` to gather public information about the company/person
2. Use `x-scan` to check for social media presence and recent activity
3. Create the `sales/{CLIENT_NAME}/docs/` directory structure
4. Produce the client brief from what you found
5. Note gaps — what questions need answering in a discovery call?

## Output: Client Brief

Write to `sales/{CLIENT_NAME}/docs/client-brief.md`:

```
# {Client Name} — Client Brief

**Date:** {today}
**Prepared by:** CSO

## Key Contacts
- {Name} — {Role} — {Email}

## What They Need
{In their words, not ours. Quote directly from transcripts where possible.}

## Timeline & Deadlines
{Key dates, launch windows, events, external pressures}

## Budget Signals
{Any quotes they've received, what they've said about money, funding status}

## Decision Makers
{Who approves, who influences, what's the process}

## Competitive Context
{Who else might they be talking to, what alternatives exist}

## Brand Notes
{Colours, fonts, tone, logo files — reference docs/brand/ assets}
{If external assets exist, reference docs/external-assets.md}

## Open Questions
{What we still need to find out}
```

## Handoff

When the brief is complete, suggest: "Client brief ready. Want me to start drafting the proposal? (loads proposal-draft)"
