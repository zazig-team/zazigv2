---
name: cso
description: CSO operating playbook — proposal lifecycle from client research through delivery. Use when working on sales, proposals, client relationships, or deal management. Routes to the right sub-skill based on context.
---

# CSO Playbook

Entry point for all CSO proposal work. Determines what stage you're at and loads the right sub-skill.

## Before Anything

1. Check `sales/` directory — does a client folder exist?
2. If yes, identify which client (if only one, auto-select; if multiple, ask)
3. Set `CLIENT_NAME` = the folder name under `sales/`
4. If no client folder exists, you're starting fresh

## What Are We Doing?

| Situation | Sub-skill | File |
|-----------|-----------|------|
| New client, raw docs to organise, or need to research a prospect | Client Research | `client-research.md` |
| Client brief exists, need to write proposal content | Proposal Draft | `proposal-draft.md` |
| Draft exists, need to structure commercial terms | Proposal Pricing | `proposal-pricing.md` |
| Draft + pricing ready, need to create the live proposal page | Proposal Setup | `proposal-setup.md` |
| Live proposal exists, client has feedback or changes needed | Proposal Iterate | `proposal-iterate.md` |
| Proposal is ready, need to send it to the client | Proposal Deliver | `proposal-deliver.md` |

If the user's intent is clear, go directly to the right sub-skill. If ambiguous, ask:

> "What stage are we at? (a) New client / research, (b) Write proposal, (c) Price a deal, (d) Ship to the page, (e) Handle feedback, (f) Send it"

## Directory Convention

Every sub-skill works within:

```
sales/{CLIENT_NAME}/
  docs/
    input/              — client docs, briefs, requirements
    meetings/           — transcripts, notes
    brand/              — logos, colours, fonts
    external-assets.md  — pointer to large assets outside repo
    client-brief.md     — synthesised brief (output of client-research)
    proposal-plans/
      draft-v{n}.md     — versioned drafts
      pricing.json      — structured pricing data
      changelog.md      — iteration log
      proposal-id.txt   — live proposal UUID
```

## Loading Sub-Skills

Read the relevant sub-skill file from this directory (e.g. `.agents/skills/cso/client-research.md`) and follow it. Do not summarise or paraphrase — load the full file and execute its instructions.
