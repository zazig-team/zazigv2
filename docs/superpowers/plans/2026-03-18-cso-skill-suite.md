# CSO Skill Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a 7-file skill suite at `.agents/skills/cso/` that gives the CSO role a complete playbook for the proposal lifecycle.

**Architecture:** One router SKILL.md that detects context and loads the right sub-skill markdown file. Six sub-skills cover: client research, proposal drafting, pricing, setup, iteration, and delivery. All files are markdown — no code, no tests.

**Tech Stack:** Markdown skill files following the `.agents/skills/{name}/SKILL.md` pattern established by existing skills like `internal-proposal`, `brainstorming`, `review-plan`.

**Design doc:** `docs/plans/active/2026-03-18-cso-skill-suite-design.md`

---

### Task 1: Router (`SKILL.md`)

**Files:**
- Create: `.agents/skills/cso/SKILL.md`

- [ ] **Step 1: Write the router skill**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/SKILL.md
git commit -m "feat: CSO skill suite — router"
```

---

### Task 2: Client Research (`client-research.md`)

**Files:**
- Create: `.agents/skills/cso/client-research.md`

- [ ] **Step 1: Write the client research skill**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/client-research.md
git commit -m "feat: CSO skill — client research"
```

---

### Task 3: Proposal Draft (`proposal-draft.md`)

**Files:**
- Create: `.agents/skills/cso/proposal-draft.md`

- [ ] **Step 1: Write the proposal draft skill**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/proposal-draft.md
git commit -m "feat: CSO skill — proposal draft"
```

---

### Task 4: Proposal Pricing (`proposal-pricing.md`)

**Files:**
- Create: `.agents/skills/cso/proposal-pricing.md`

- [ ] **Step 1: Write the proposal pricing skill**

```markdown
# Proposal Pricing

Structure the commercial terms for a proposal. Separate from drafting because pricing needs its own focused conversation.

## Prerequisites

- A draft must exist at `sales/{CLIENT_NAME}/docs/proposal-plans/draft-v*.md`. If not, say: "No draft found. Let me write one first." and load `proposal-draft.md`.

## Process

### 1. Read the Draft

Understand the phases, deliverables, and timeline. Count months per phase using dates from the client brief.

### 2. Standard Rate Card

**Internal only — never share with clients.**

| Role | Phase 1 (fully managed) | Phase 2+ (partially managed) |
|------|------------------------|------------------------------|
| Tom Weaver (CPO) | $1,500/mo | $750/mo |
| Chris Evans (CTO) | $1,500/mo | $750/mo |
| Autonomous Execs & Workers | $1,000/mo | $500/mo |
| Infrastructure (compute, subs) | $1,000/mo | $1,500/mo |
| **Total** | **$5,000/mo** | **$3,500/mo** |

These are defaults. Adjust per deal based on:
- Scope complexity (more infra-heavy = shift budget to infra)
- Tom/Chris involvement level (advisory-only = lower)
- Strategic value of the client (first client in a vertical = may discount)

### 3. Propose Breakdown

Present per-role table for each phase, with:
- Monthly cost per role
- Phase duration in months
- Phase total
- Overall total (all phases combined)

### 4. Commercial Structure

Ask about each:

**Payment:** Default is loan note. Options:
- (a) Loan note — repaid after seed round or any funding >$300K
- (b) Monthly cash payment
- (c) Hybrid — reduced monthly + smaller loan note

**Off-ramps:** Default is exit at each phase boundary. All code and IP transferable at any point.

**Investment dependency:** If loan note: what happens if client doesn't raise? Default: engagement pauses, interest accrues on outstanding balance.

**Infrastructure at scale:** Always borne by client. We cover infra during build phases only.

### 5. Produce Pricing Data

Create structured pricing file at `sales/{CLIENT_NAME}/docs/proposal-plans/pricing.json`:

```json
{
  "phases": [
    {
      "name": "Phase 1 — ...",
      "monthly": 5000,
      "duration_months": 2.5,
      "deliverables": ["...", "..."]
    }
  ],
  "total_year1": 26500,
  "loan_note_terms": "..."
}
```

Also append the pricing section to the latest draft.

## Guardrails

- Never share the rate card with clients
- Always anchor against the alternative cost ("the agency quoted $X")
- Flag if total is below $20K (may not be worth the engagement)
- Infrastructure at launch scale always borne by client
- Never commit to pricing without Tom's approval

## Handoff

When pricing is approved: "Pricing locked. Ready to create the live proposal page? (loads proposal-setup)"
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/proposal-pricing.md
git commit -m "feat: CSO skill — proposal pricing"
```

---

### Task 5: Proposal Setup (`proposal-setup.md`)

**Files:**
- Create: `.agents/skills/cso/proposal-setup.md`

- [ ] **Step 1: Write the proposal setup skill**

```markdown
# Proposal Setup

Turn a draft and pricing into a live proposal page on zazig.com.

## Prerequisites

- Draft at `sales/{CLIENT_NAME}/docs/proposal-plans/draft-v*.md`
- Pricing at `sales/{CLIENT_NAME}/docs/proposal-plans/pricing.json`
- If either is missing, route to the appropriate skill.

## Process

### 1. Check Prior Proposals

Query the database for existing proposals to use as structural templates:

```sql
SELECT id, title, content FROM proposals ORDER BY created_at DESC LIMIT 3;
```

Use the section structure (keys, ordering) from the most recent proposal as a starting point.

### 2. Prepare Content JSONB

Convert the markdown draft into the `content` jsonb structure:

```json
{
  "sections": [
    { "key": "executive_summary", "title": "Executive Summary", "body_md": "...", "order": 1 },
    { "key": "the_opportunity", "title": "The Opportunity", "body_md": "...", "order": 2 }
  ]
}
```

Rules for `key`: lowercase, underscores, derived from the section title. Must be unique.

### 3. Collect Client Details

Ask for (or find in client-brief.md):
- **Client name** (display name, e.g. "Live Beyond")
- **Client logo** — if available in `docs/brand/`, copy to `packages/webui/public/brand/{client-slug}-logo.png`. If not available, leave null.
- **Client brand colour** — hex code if known, otherwise null
- **Allowed emails** — at minimum the primary contact. Ask: "Who should be able to view this proposal?"
- **Valid until** — ask: "How long should this be valid?" Default: 90 days from today.
- **Prepared by** — default: "Tom Weaver"

### 4. Handle Brand Assets

If copying brand files to `packages/webui/public/brand/`:
1. Copy the file
2. Check `packages/webui/vercel.json` — ensure the rewrite excludes `/brand/`
3. If the rewrite pattern needs updating, modify it
4. Commit the brand assets

### 5. Create the Proposal

Use Python + Supabase REST API to insert:

```python
import urllib.request, json

url = "https://jmussmwglgbwncgygzbz.supabase.co"
key = "SERVICE_ROLE_KEY from doppler"

body = {
    "company_id": "00000000-0000-0000-0000-000000000001",
    "title": "Zazig × {Client Name} — ...",
    "status": "draft",
    "content": { ... },
    "client_name": "...",
    "client_logo_url": "/brand/...",
    "client_brand_color": "#...",
    "prepared_by": "Tom Weaver",
    "allowed_emails": ["..."],
    "pricing": { ... },
    "valid_until": "..."
}

# POST to /rest/v1/proposals
```

### 6. Record the Proposal ID

Save the returned UUID to `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`.

### 7. Report

Print:
- Proposal URL: `zazig.com/proposals/{id}`
- Status: `draft` (not visible to client until sent)
- Allowed viewers: list emails
- Valid until: date

## Guardrails

- Status MUST be `draft` — never auto-send
- Confirm the URL loads before reporting success (use Playwright if available)
- Never auto-send — delivery is a separate skill with its own approval gate
- Get the service role key from Doppler: `doppler secrets get SUPABASE_SERVICE_ROLE_KEY --project zazig --config prd --plain`

## Handoff

"Proposal is live in draft at {URL}. Want to review it before sending? (loads proposal-iterate) Or ready to send? (loads proposal-deliver)"
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/proposal-setup.md
git commit -m "feat: CSO skill — proposal setup"
```

---

### Task 6: Proposal Iterate (`proposal-iterate.md`)

**Files:**
- Create: `.agents/skills/cso/proposal-iterate.md`

- [ ] **Step 1: Write the proposal iterate skill**

```markdown
# Proposal Iterate

Handle feedback rounds on a live proposal.

## Prerequisites

- Proposal ID — check `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`
- If no ID, ask for it or check the DB: `SELECT id, title, status FROM proposals WHERE company_id = '00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC;`

## Process

### 1. Fetch Current State

Always fetch the live content before making changes — never assume what's in the DB:

```python
# GET /rest/v1/proposals?id=eq.{PROPOSAL_ID}&select=content,pricing,status
```

### 2. Parse Feedback

Feedback comes in different forms:
- **Specific text changes** ("update Tom's bio to say X") → content update
- **Structural changes** ("move this from Phase 2 to Phase 3") → content update
- **Pricing adjustments** ("Chris comes down to $750") → content + pricing jsonb update
- **Visual/rendering issues** ("the paragraph break is missing") → could be content (markdown) or component (code)

### 3. Determine Change Type

| Change | Where | Deploy needed? |
|--------|-------|---------------|
| Section text | DB `content` jsonb | No — instant |
| Pricing figures | DB `content` + `pricing` jsonb | No — instant |
| Allowed emails | DB `allowed_emails` | No — instant |
| Proposal status | DB `status` | No — instant |
| Markdown rendering bug | `Proposal.tsx` renderMarkdown | Yes — code change + push |
| Layout/styling issue | `global.css` | Yes — code change + push |
| New brand assets | `public/brand/` + vercel.json | Yes — code change + push |

### 4. Apply Changes

**For DB changes:** Use Python + Supabase REST API:
1. Fetch current content/pricing
2. Modify in Python
3. PATCH back with `Prefer: return=minimal`

**For code changes:**
1. Modify the file
2. Verify build: `cd packages/webui && npm run build`
3. Commit and push to master
4. Wait ~30s for Vercel deploy

### 5. Verify

After changes:
- If DB-only: tell user to hard-refresh (Cmd+Shift+R)
- If code change: wait for Vercel deploy, then verify via Playwright screenshot or ask user to check
- If user reports issue persists after refresh: check if Vercel CDN is serving stale assets (compare JS hash in page source vs local build)

### 6. Log the Change

Append to `sales/{CLIENT_NAME}/docs/proposal-plans/changelog.md`:

```
## {date} — {summary}
- Changed: {what}
- Reason: {why}
- Type: content | pricing | component
```

### Resetting Status

If the client has already accepted and you need to reset for testing:

```sql
UPDATE proposals SET status = 'draft' WHERE id = '{PROPOSAL_ID}';
```

Use the Management API or REST API with service role key.

## Guardrails

- Always fetch before modifying — never assume DB state
- For code changes, always verify TypeScript compiles before pushing
- Don't force-push to master
- After each round, ask "anything else?" — don't assume done

## Handoff

When iteration is complete: "Looking good. Ready to send? (loads proposal-deliver)"
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/proposal-iterate.md
git commit -m "feat: CSO skill — proposal iterate"
```

---

### Task 7: Proposal Deliver (`proposal-deliver.md`)

**Files:**
- Create: `.agents/skills/cso/proposal-deliver.md`

- [ ] **Step 1: Write the proposal deliver skill**

```markdown
# Proposal Deliver

Send the proposal to the client and track engagement.

## Prerequisites

- Proposal must exist and be in `draft` status
- Get proposal ID from `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`

## Process

### 1. Pre-Flight Checks

Verify before sending:

- [ ] All sections have content (no empty `body_md`)
- [ ] Pricing is populated with at least one phase
- [ ] `allowed_emails` has at least one client email
- [ ] `valid_until` is set and in the future
- [ ] Brand assets load (if `client_logo_url` is set, verify the image serves correctly)
- [ ] The proposal URL loads without errors

Run checks by fetching the proposal and validating each field. If any fail, report what's missing and suggest fixes.

### 2. Get Approval

**Never send without explicit approval from Tom.**

Present a summary:
```
Ready to send:
  Title: {title}
  Client: {client_name}
  URL: zazig.com/proposals/{id}
  Viewers: {allowed_emails}
  Valid until: {valid_until}
  Total value: {total}

Confirm? (y/n)
```

### 3. Change Status

```python
# PATCH /rest/v1/proposals?id=eq.{PROPOSAL_ID}
# Body: {"status": "sent"}
```

### 4. Compose Notification

Draft a message Tom can send to the client. Tone should match the CSO's active archetype.

**Template (Relationship Builder):**

```
Subject: Zazig × {Client Name} — Proposal Ready

Hi {Contact First Name},

Great speaking with you. As discussed, I've put together a proposal
for how Zazig can help build {project description}.

You can view it here: https://zazig.com/proposals/{id}

Sign in with your Google account ({client_email}) to access it.
Happy to walk through any section in detail — just let me know
a good time.

Best,
Tom
```

When Resend is integrated, this will send automatically. For now, present the draft for Tom to copy-paste.

### 5. Log Delivery

Append to `sales/{CLIENT_NAME}/docs/proposal-plans/changelog.md`:

```
## {date} — Proposal sent
- Status: draft → sent
- Viewers: {emails}
- URL: zazig.com/proposals/{id}
```

## Post-Delivery Monitoring

The `proposal_views` table tracks engagement automatically:
- When the client views the proposal, `viewed_at` is set and status changes to `viewed`
- Each view is logged in `proposal_views` with email and timestamp

**Check engagement:**
```sql
SELECT viewer_email, viewed_at, COUNT(*) as views
FROM proposal_views
WHERE proposal_id = '{PROPOSAL_ID}'
GROUP BY viewer_email, viewed_at;
```

**If no view after 48 hours:** Draft a follow-up nudge for Tom to send.

**If client clicks "Start Pilot Sprint":** Status changes to `accepted`. The events table logs `proposal_access_requested` — monitor for this.

## Guardrails

- Never send without Tom's explicit approval
- Include the proposal URL in notifications, never the raw content
- Flag if `valid_until` is less than 7 days away
- Never auto-follow-up — draft nudges for Tom to review and send manually
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/cso/proposal-deliver.md
git commit -m "feat: CSO skill — proposal deliver"
```

---

### Task 8: Register CSO Skill

**Files:**
- Modify: `supabase/migrations/181_cso_role.sql` (for reference, but actual change is a DB update)

- [ ] **Step 1: Update the CSO role's skills array in the DB**

Add `cso` to the skills array:

```bash
SUPABASE_ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN --project zazig --config prd --plain)
curl -s -X POST "https://api.supabase.com/v1/projects/jmussmwglgbwncgygzbz/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE public.roles SET skills = '{cso,brainstorming,internal-proposal,review-plan,deep-research,x-scan}' WHERE name = 'cso';"}'
```

- [ ] **Step 2: Verify**

```bash
curl -s -X POST "..." -d '{"query": "SELECT name, skills FROM public.roles WHERE name = 'cso';"}'
```

Expected: `cso` is first in the skills array.

- [ ] **Step 3: Update the migration file to match**

Update `supabase/migrations/181_cso_role.sql` so the skills array includes `cso`:

Change: `'{brainstorming,internal-proposal,review-plan,deep-research,x-scan}'`
To: `'{cso,brainstorming,internal-proposal,review-plan,deep-research,x-scan}'`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/181_cso_role.sql
git commit -m "feat: register CSO skill in role definition"
```
