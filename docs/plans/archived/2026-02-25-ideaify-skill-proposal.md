# Ideaify Skill Proposal

**Date:** 2026-02-25
**Status:** Proposal
**Author:** CPO (persistent agent)
**Companion docs:** `2026-02-24-idea-to-job-pipeline-design.md` (pipeline reference), `2026-02-24-jobify-skill-design.md` (skill pattern reference), `2026-02-24-featurify-skill-design.md` (skill pattern reference)
**Depends on:** Ideas Inbox table (new Supabase migration, does not exist yet)

___
## Tom feedback
2026-02-25 This all looks great but now we need to align the ideas in this, 2026-02-25-ideas-inbox-proposal.md, 2026-02-25-telegram-ideas-bot-proposal.md so we're not inventing or designing multiple things that do the same thing. Also, how can we potentially link this to the /internal-proposal skill which is already excellent at taking a captured idea and turning it into a stage one proposal for review?

---

## Problem

**Today:** Ideas enter the zazigv2 pipeline through direct human-to-CPO conversation. The CPO triages in real time, determines scope, and routes accordingly (Stage 1 of the idea-to-job pipeline). This works when the human is sitting at a terminal, thinking clearly, and presenting one idea at a time.

**Which is a problem, because:** Most ideas do not arrive clean.

- A 10-minute voice note covers 5 different things — a bug, a feature request, two vague notions, and a complaint about something unrelated.
- A Slack message is half stream-of-consciousness, half useful signal.
- A meeting transcript contains 3 actionable items buried in 45 minutes of discussion.
- A human sends a text dump at 2 AM and the CPO needs to make sense of it 6 hours later without conversational context.

The CPO is a strategic thinker, not a stenographer. Asking it to simultaneously parse messy input, clean it up, categorise it, split multi-idea blobs, check for duplicates, and triage by scope is a waste of its context window and a misuse of its role. The CPO should receive structured, pre-processed ideas — not raw signal.

**What if?:** A dedicated processing step sits between raw input and the CPO's triage. It takes any unstructured input — text dump, voice transcription, Slack message, meeting notes — and produces clean, categorised, individual idea records in a structured inbox. The CPO pulls from this inbox instead of parsing raw input. Ideas arrive pre-triaged, pre-split, and pre-tagged.

## Hypothesis

The gap between "human has a thought" and "CPO can act on it" is a data-cleaning problem, not a product-strategy problem. An LLM can reliably extract, separate, clean, and categorise ideas from unstructured text without needing the CPO's product judgment. The product judgment comes later, when the CPO decides what to do with each idea. Separating these concerns will improve both — cleaner input to the CPO, and a CPO that spends its context on decisions rather than parsing.

## Therefore

Introduce the `ideaify` skill: a processing step that takes raw unstructured input and produces structured idea records in a new Ideas Inbox table. This sits upstream of the current pipeline Stage 1 (Ideation), creating a new Stage 0 that handles the messy-input-to-clean-idea transformation.

---

## Where Ideaify Fits in the Pipeline

```
              RAW INPUT
    (voice note, Slack msg, text dump,
     meeting transcript, email forward)
                  |
                  v
        ┌──────────────────┐
        │ [0] INTAKE       │  <-- NEW
        │ ideaify skill    │
        │ clean, split,    │
        │ categorise, tag  │
        └────────┬─────────┘
                 |
                 v
        ┌──────────────────┐
        │   IDEAS INBOX    │  <-- NEW (Supabase table)
        │   structured,    │
        │   individual,    │
        │   tagged ideas   │
        └────────┬─────────┘
                 |
        CPO pulls from inbox
        (or is notified of new ideas)
                 |
                 v
        ┌──────────────────┐
        │ [1] IDEATION     │  <-- EXISTING (unchanged)
        │ CPO + Human      │
        │ triage by scope  │
        └────────┬─────────┘
                 |
           (rest of pipeline unchanged)
```

Ideaify does not replace the CPO's triage. It replaces the CPO's parsing. The CPO still decides what to do with each idea — ideaify just makes sure each idea arrives clean, separated, and categorised.

---

## Design Decisions

### 1. Skill vs Contractor Role

**Decision: Skill first, contractor role later.**

Rationale: Skills and contractors are not mutually exclusive. A skill is a prompt template that guides an agent's behaviour. A contractor is an ephemeral agent dispatched by the orchestrator. The question is not "skill or contractor?" — it is "who runs this skill?"

**Phase 1 (immediate):** Ideaify is a skill invoked directly by whatever agent receives raw input. In the current system, that is the CPO (via gateway messages). When the CPO receives a messy input, it recognises the need for processing and runs ideaify before triaging. This is lightweight — no new infrastructure, no new contractor role, no new dispatch mechanism.

**Phase 2 (when volume justifies it):** Ideaify becomes a contractor role (`intake-processor`). The orchestrator automatically dispatches it when raw input arrives, before the CPO ever sees it. The CPO is notified of processed ideas, not raw input. This requires a new trigger mechanism and contractor registration — worth the investment when the number of inbound ideas exceeds what the CPO can pre-process without losing strategic context.

The transition from Phase 1 to Phase 2 is mechanical: same skill, different runner. No skill rewrite needed.

### 2. Intelligence Level — Clean vs Analyse

**Decision: Clean, categorise, and flag. Do not analyse or research.**

Ideaify should:
- Clean up language and structure
- Split multi-idea inputs into individual ideas
- Categorise by scope, domain, and complexity
- Tag with relevant metadata
- Flag potential duplicates (surface-level text similarity, not deep semantic matching)
- Flag ambiguity that needs human clarification

Ideaify should NOT:
- Research feasibility ("Is this technically possible?")
- Check the codebase for existing implementations
- Estimate effort or timeline
- Make priority recommendations
- Decide whether an idea is good or bad

Why: The CPO is the bar-raiser for product decisions. The Monitoring Agent does feasibility research. Ideaify is a data-cleaning step — expanding its scope into analysis creates a second product brain that competes with the CPO's judgment. If an idea needs research, the CPO commissions it after triage. Ideaify should not pre-empt that decision.

**One exception:** Duplicate detection at the surface level. If someone submits "add dark mode" and there is already an idea or feature called "dark mode support," ideaify should flag the potential overlap. It should not decide they are duplicates — just surface the connection for the CPO.

### 3. Handling Ambiguity

**Decision: Tag as `needs-clarification` and move on.**

Ideaify does not ask for clarification. It processes what it has and marks gaps. The CPO (or the human, prompted by the CPO) provides clarification later.

Rationale: Ideaify may process input asynchronously — a voice note from 3 hours ago, a batch of Slack messages, a meeting transcript. Interactive clarification breaks the async model. It is better to produce a partially-categorised idea with explicit "I could not determine X" flags than to block on a question that may take hours to answer.

Flags ideaify can set:
- `needs-clarification: scope unclear — could be a quick fix or a multi-feature initiative`
- `needs-clarification: domain ambiguous — touches both product and engineering`
- `needs-clarification: may be a duplicate of [existing idea/feature], human should confirm`
- `needs-clarification: vague — "make it better" has no actionable detail`

### 4. Multi-Idea Splitting

This is the most valuable thing ideaify does. The rules:

- **One idea per record.** If the input contains 5 ideas, produce 5 records.
- **Preserve attribution.** Every split idea links back to the original input (via `source_input_id` or similar).
- **Preserve context.** If idea #3 only makes sense in the context of idea #1 ("and then for the auth system, we should also..."), the split idea should include enough context to stand alone.
- **When in doubt, do not split.** A single idea with two aspects ("add dark mode and also a theme picker") is one idea, not two. Only split when the ideas are genuinely independent ("fix the login bug, and also let's add analytics tracking").
- **Annotate relationships.** If two split ideas are related (same domain, same area of the product), note the relationship in both records.

---

## Ideas Inbox Data Model

New Supabase table: `ideas`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, default gen_random_uuid() |
| `company_id` | uuid | FK -> companies. Tenant boundary. |
| `source_type` | text | CHECK (`voice`, `slack`, `terminal`, `email`, `meeting_transcript`, `agent_discovered`, `manual`). Where the raw input came from. |
| `source_input` | text | The raw unprocessed input. Preserved verbatim for audit. |
| `source_input_id` | uuid | Nullable. Self-FK -> ideas.id. If this idea was split from a larger input, points to the parent record. |
| `title` | text | Clean, concise summary (one line, under 80 chars). |
| `description` | text | Cleaned-up description. 1-3 paragraphs. What the idea is and why it might matter. |
| `scope` | text | CHECK (`job`, `feature`, `initiative`, `project`, `unknown`). Ideaify's best guess at the work size. |
| `complexity` | text | CHECK (`simple`, `medium`, `complex`, `unknown`). Estimated effort level. |
| `domain` | text | CHECK (`product`, `engineering`, `marketing`, `cross-cutting`, `unknown`). Which exec portfolio. |
| `autonomy` | text | CHECK (`exec-can-run`, `needs-human-input`, `needs-human-approval`, `unknown`). Whether an exec can just pick this up. |
| `tags` | text[] | Array of free-form tags. Ideaify applies what it can; CPO can add more later. |
| `related_features` | uuid[] | Nullable. Feature IDs that may overlap with this idea (surface-level duplicate detection). |
| `related_ideas` | uuid[] | Nullable. Other idea IDs that were split from the same input or seem related. |
| `flags` | text[] | Array of flags: `needs-clarification`, `potential-duplicate`, `multi-idea-split`, etc. |
| `clarification_notes` | text | Nullable. What ideaify could not determine and why. |
| `status` | text | CHECK (`new`, `triaged`, `promoted`, `parked`, `rejected`). Default `new`. |
| `promoted_to` | text | Nullable. What the idea became: `feature:{uuid}`, `job:{uuid}`, `project:{uuid}`. Set by CPO after triage. |
| `submitted_by` | text | Who submitted the raw input. Could be a username, an agent role, or 'system'. |
| `processed_by` | text | Which agent/skill processed this. Default 'ideaify'. |
| `created_at` | timestamptz | Default now(). |
| `triaged_at` | timestamptz | Nullable. When the CPO triaged this idea. |

**Key decisions:**

- **`source_input` is preserved verbatim.** The original messy input is never lost. This is an audit trail and a fallback — if ideaify misinterprets something, the CPO can read the source.
- **`scope` is a guess, not a decision.** Ideaify says "this looks like a feature-sized piece of work." The CPO decides whether it actually is.
- **`status` lifecycle is simple.** `new` -> `triaged` (CPO has looked at it) -> `promoted` (turned into a feature/job/project) or `parked` (not now) or `rejected` (not ever). The CPO owns all transitions after `new`.
- **`promoted_to` links the idea to the pipeline.** Once an idea becomes a feature, we want traceability: this feature originated from this idea which came from this voice note.
- **No priority column.** Ideaify does not prioritise. The CPO does, at triage time, by choosing what to promote and in what order.

### RLS Policy

```sql
-- Ideas are company-scoped
CREATE POLICY "ideas_company_isolation" ON ideas
  USING (company_id = current_setting('request.jwt.claims')::json->>'company_id');
```

---

## Ideaify Skill Prompt (Draft)

```markdown
# Ideaify

**Role:** Any agent receiving raw input (Phase 1: CPO; Phase 2: Intake Processor contractor)
**Pattern:** Skill Pattern -- injected into the running agent's prompt when raw input needs processing.

You are processing raw, unstructured input into clean idea records for the Ideas Inbox.
Your job is data cleaning and categorisation, not product judgment.

---

## What This Skill Does

- Takes raw unstructured input (text dump, voice transcription, Slack message, etc.)
- Cleans it into well-written, clear prose
- Splits multi-idea inputs into individual ideas
- Categorises each idea by scope, complexity, domain, and autonomy level
- Flags ambiguity, potential duplicates, and items needing clarification
- Writes structured idea records to the Ideas Inbox via MCP tools

## What This Skill Does NOT Do

- Decide whether an idea is good or bad -- that's the CPO
- Research feasibility or check the codebase -- that's a research contractor
- Prioritise ideas -- that's the CPO
- Create features, jobs, or projects -- that's the CPO via the downstream pipeline
- Ask the human for clarification -- flag what's unclear and move on

---

## Prerequisites

Before you start, you should have:

1. **Raw input text** -- the unstructured content to process
2. **Source metadata** -- where it came from (voice, slack, terminal, etc.) and who submitted it
3. Access to **MCP tools**: `create_idea`, `query_ideas`, `query_features`, `query_projects`

If any prerequisite is missing, stop and report the gap. Do not improvise.

---

## Procedure

### Step 1: Read and Understand the Input

Read the raw input in full. Before doing anything, determine:

- How many distinct ideas are present? (Could be 1, could be 10)
- Is the input coherent or rambling?
- What is the general domain? (product, engineering, marketing, mixed)

If the input is a single, clear idea, skip to Step 3.

### Step 2: Split Multi-Idea Input

If the input contains multiple distinct ideas, separate them.

**Splitting rules:**
- One idea per record. Independent topics get their own record.
- Preserve context. If an idea references another ("and for that auth system..."),
  include enough context in the split idea to make it standalone.
- When in doubt, do not split. "Add dark mode and a theme picker" is one idea.
  "Fix the login bug and also add analytics" is two.
- Annotate relationships between split ideas using `related_ideas`.

For each identified idea, proceed to Step 3 independently.

### Step 3: Clean the Idea

Transform the raw text into a structured idea:

**Title:** One line, under 80 characters. Clear and specific.
- Good: "Add OAuth support for Google and GitHub"
- Bad: "auth stuff"
- Bad: "We should probably think about maybe adding some kind of login thing with Google"

**Description:** 1-3 paragraphs of clean prose.
- What the idea is (concrete, not vague)
- Why it might matter (if the input hints at motivation)
- Any constraints or context mentioned in the input
- Do NOT add your own analysis or recommendations

### Step 4: Categorise

For each idea, assess:

**Scope** -- how big is this?
| Value | Signal |
|-------|--------|
| `job` | Single fix, one file, under 30 minutes. "Fix the typo on the landing page." |
| `feature` | Defined capability, multiple jobs. "Add dark mode to the dashboard." |
| `initiative` | Multiple features, shared theme. "Rebuild the authentication system." |
| `project` | New repo, new product. "Build a mobile app." |
| `unknown` | Not enough detail to assess. Flag for clarification. |

**Complexity** -- how hard?
| Value | Signal |
|-------|--------|
| `simple` | Well-defined, mechanical, no ambiguity |
| `medium` | Some judgment needed, multiple components |
| `complex` | Architecture decisions, cross-cutting, deep tradeoffs |
| `unknown` | Cannot assess from the description alone |

**Domain** -- whose portfolio?
| Value | Signal |
|-------|--------|
| `product` | User-facing features, UX changes, roadmap items -> CPO |
| `engineering` | Infrastructure, performance, security, tech debt -> CTO |
| `marketing` | Positioning, growth, content, branding -> CMO |
| `cross-cutting` | Touches multiple domains. Note which ones. |
| `unknown` | Ambiguous. Flag for clarification. |

**Autonomy** -- can an exec just run with it?
| Value | Signal |
|-------|--------|
| `exec-can-run` | Clear enough that the responsible exec can proceed without asking the human |
| `needs-human-input` | Requires human preferences, brand decisions, or domain knowledge the exec lacks |
| `needs-human-approval` | Significant scope, cost, or strategic impact -- exec should propose, human approves |
| `unknown` | Cannot determine without more context |

### Step 5: Check for Duplicates and Overlaps

Query existing ideas and features for surface-level overlaps:

1. Call `query_ideas` with relevant keywords from the title
2. Call `query_features` to check if similar features exist in any project
3. Call `query_projects` to check if the idea fits an existing project

If overlaps are found:
- Add the related IDs to `related_features` or `related_ideas`
- Add `potential-duplicate` to `flags`
- Note the overlap in `clarification_notes`: "Similar to feature 'Dark Mode Support'
  (uuid) in project 'Dashboard'. May be a duplicate or an extension."

Do NOT decide whether it is a duplicate. Flag it and let the CPO decide.

### Step 6: Tag

Apply tags based on what you can determine:

- Domain tags: `product`, `engineering`, `marketing`
- Area tags: `auth`, `ui`, `performance`, `security`, `database`, etc.
- Source tags: `voice-note`, `slack`, `meeting`, etc.
- Signal tags: `urgent` (if the input conveys urgency), `quick-win` (if trivially small)

Keep tags lowercase, hyphenated, and consistent with existing tags in the inbox.

### Step 7: Write to Ideas Inbox

Call `create_idea` for each processed idea with all fields populated.
If the input was split, create all ideas and then update `related_ideas`
on each to cross-reference the siblings.

### Step 8: Summary

After processing all ideas from the input, produce a summary:

"Processed [N] ideas from [source_type] input by [submitted_by]:
- [Title 1] (scope: feature, domain: product) [flags if any]
- [Title 2] (scope: job, domain: engineering)
- ..."

---

## Quality Checklist

Before writing to the inbox, verify for each idea:

- [ ] Title is under 80 characters and specific (not vague)
- [ ] Description is clean prose, not raw copy-paste from the input
- [ ] Scope assessment has reasoning (not just a random pick)
- [ ] Domain assignment is defensible
- [ ] If split from multi-idea input, the idea stands alone without context from siblings
- [ ] Source input is preserved verbatim in the record
- [ ] Duplicate check was performed (even if no duplicates found)
- [ ] Flags are applied where uncertainty exists (do not pretend to be certain when you are not)

---

## MCP Tools Required

| Tool | Purpose | When |
|------|---------|------|
| `create_idea` | Write processed idea to the Ideas Inbox | Step 7 |
| `query_ideas` | Check for duplicate/overlapping ideas | Step 5 |
| `query_features` | Check if similar features exist | Step 5 |
| `query_projects` | Check if the idea fits an existing project | Step 5 |

**New tools needed:**
- `create_idea` -- inserts a row into the `ideas` table
- `query_ideas` -- searches ideas by keyword, status, domain, or tags
- `batch_create_ideas` -- for multi-idea splits, create all atomically (same pattern as `batch_create_features`)
```

---

## MCP Tool Specifications

### `create_idea`

New edge function + MCP wrapper. Follows the same pattern as `create_feature`.

```
Parameters:
  title: string (required)
  description: string (required)
  source_type: enum (required)
  source_input: string (required)
  source_input_id: uuid (optional -- parent idea if split)
  scope: enum (optional, default 'unknown')
  complexity: enum (optional, default 'unknown')
  domain: enum (optional, default 'unknown')
  autonomy: enum (optional, default 'unknown')
  tags: string[] (optional)
  related_features: uuid[] (optional)
  related_ideas: uuid[] (optional)
  flags: string[] (optional)
  clarification_notes: string (optional)
  submitted_by: string (optional)

Returns:
  idea_id: uuid
```

### `query_ideas`

New edge function + MCP wrapper. Follows the same pattern as `query_features`.

```
Parameters:
  idea_id: uuid (optional -- returns single idea)
  status: string (optional -- filter by status)
  domain: string (optional -- filter by domain)
  scope: string (optional -- filter by scope)
  search: string (optional -- full-text search on title + description)
  limit: number (optional, default 20)

Returns:
  ideas: array of idea objects
```

### `batch_create_ideas`

New edge function + MCP wrapper. Same pattern as `batch_create_features`.

```
Parameters:
  ideas: array of create_idea parameter objects

Returns:
  ideas: array of { idea_id, title, status }
```

---

## Example Inputs and Outputs

### Example 1: Clean single idea

**Input:**
```
source_type: terminal
submitted_by: tom
text: "We should add dark mode to the dashboard. Users keep asking for it."
```

**Output:** 1 idea record

```
title: "Add dark mode to the dashboard"
description: "Users have been requesting dark mode for the dashboard UI. This would
  add a dark colour scheme as an alternative to the current light theme, toggled via
  user preference."
scope: feature
complexity: medium
domain: product
autonomy: needs-human-input
tags: [ui, dashboard, user-request]
flags: []
clarification_notes: null
```

### Example 2: Messy multi-idea voice note

**Input:**
```
source_type: voice
submitted_by: tom
text: "OK so I was thinking about a few things. First, the login page is
  broken on Safari -- like the button doesn't render properly, we need to
  fix that. Also I've been thinking we should probably add some kind of
  analytics to track user engagement, nothing fancy, just page views and
  session duration. Oh and Chris mentioned that the deployment pipeline
  is really slow, takes like 20 minutes, we should look into that.
  Actually one more thing -- for the marketing site, we should probably
  have a changelog page where we post updates about new features."
```

**Output:** 4 idea records

```
Idea 1:
  title: "Fix login button rendering on Safari"
  description: "The login page button does not render correctly on Safari.
    Likely a CSS compatibility issue. Needs investigation and fix."
  scope: job
  complexity: simple
  domain: engineering
  autonomy: exec-can-run
  tags: [bug, safari, login, ui]
  flags: []

Idea 2:
  title: "Add basic user engagement analytics"
  description: "Track page views and session duration across the application.
    Lightweight implementation -- not a full analytics suite. Goal is visibility
    into user engagement patterns."
  scope: feature
  complexity: medium
  domain: product
  autonomy: needs-human-input
  tags: [analytics, tracking, user-engagement]
  flags: [needs-clarification]
  clarification_notes: "Scope is ambiguous -- 'nothing fancy' suggests minimal
    implementation, but analytics can expand quickly. Human should confirm
    boundaries: which pages, what metrics, any third-party tools or homebrew?"

Idea 3:
  title: "Investigate and improve deployment pipeline speed"
  description: "The deployment pipeline currently takes approximately 20 minutes.
    This is perceived as too slow. Needs investigation to identify bottlenecks
    and potential optimisations."
  scope: feature
  complexity: unknown
  domain: engineering
  autonomy: exec-can-run
  tags: [infrastructure, ci-cd, performance, deployment]
  flags: [needs-clarification]
  clarification_notes: "Complexity unknown -- could be a simple caching fix or a
    fundamental pipeline restructure. Research needed before scoping."

Idea 4:
  title: "Add a changelog page to the marketing site"
  description: "A public-facing page on the marketing site where feature updates
    and releases are posted. Keeps users informed about product development."
  scope: feature
  complexity: simple
  domain: marketing
  autonomy: needs-human-input
  tags: [marketing-site, changelog, content]
  flags: []
```

All four ideas would have `related_ideas` pointing to each other (same source input) and `source_input_id` pointing to a shared parent record that holds the verbatim voice transcription.

### Example 3: Vague one-liner

**Input:**
```
source_type: slack
submitted_by: chris
text: "we should make the app faster"
```

**Output:** 1 idea record

```
title: "Improve application performance"
description: "General request to improve the application's speed.
  No specific area, page, or metric identified."
scope: unknown
complexity: unknown
domain: engineering
autonomy: needs-human-input
tags: [performance]
flags: [needs-clarification]
clarification_notes: "Too vague to categorise. Which part of the app? What is the
  current performance? What is the target? Is this about page load time, API
  response time, build time, or something else?"
```

---

## CPO Triage Workflow (Post-Ideaify)

Once ideas are in the inbox, the CPO needs a way to work through them. This is not part of ideaify itself, but it shapes how ideaify's output is consumed.

**Proposed flow:**

1. **CPO queries the inbox** for `status: new` ideas, ordered by `created_at`.
2. **For each idea, the CPO decides:**
   - **Promote** -- create a feature, job, or project from it. Set `status: promoted`, `promoted_to: feature:{uuid}`.
   - **Park** -- good idea, not now. Set `status: parked`. Revisit during planning.
   - **Reject** -- not going to happen. Set `status: rejected`. Brief reason in notes.
   - **Merge** -- duplicate of an existing idea or feature. Link and reject.
   - **Clarify** -- needs more info. Leave `status: new`, add clarification questions, notify human.
3. **The CPO can batch-triage** -- scan 10 ideas and quickly sort them, or deep-dive into one.

This workflow could become its own skill (`/triage-ideas` or similar) or be part of the standup skill. The CPO already runs standups -- reviewing the idea inbox could be a standup activity.

### `update_idea` MCP Tool

Needed for CPO triage:

```
Parameters:
  idea_id: uuid (required)
  status: enum (optional)
  promoted_to: string (optional)
  tags: string[] (optional -- additive, merges with existing)
  clarification_notes: string (optional -- appends)

Returns:
  success: boolean
```

---

## Implementation Requirements

### New Database Objects

1. **Migration: `ideas` table** -- schema as defined in the data model section above
2. **RLS policy** -- company isolation, same pattern as other tables
3. **Indexes:**
   - `idx_ideas_company_status` on `(company_id, status)` -- for CPO inbox queries
   - `idx_ideas_company_domain` on `(company_id, domain)` -- for domain-filtered views
   - Full-text search index on `title || ' ' || description` -- for duplicate detection

### New Edge Functions

4. **`create-idea`** -- insert a single idea (same pattern as `create-feature`)
5. **`batch-create-ideas`** -- insert multiple ideas atomically (same pattern as `batch-create-features`)
6. **`query-ideas`** -- query with filters + full-text search (same pattern as `query-features`)
7. **`update-idea`** -- update status, tags, promoted_to (same pattern as `update-feature`)

### New MCP Tool Wrappers

8. **`create_idea`** in `agent-mcp-server.ts` -- wraps the edge function
9. **`batch_create_ideas`** in `agent-mcp-server.ts`
10. **`query_ideas`** in `agent-mcp-server.ts`
11. **`update_idea`** in `agent-mcp-server.ts`

### New Skill File

12. **`projects/skills/ideaify.md`** -- the skill prompt (draft above, refined during implementation)

### Role Scoping

- **CPO** gets: `create_idea`, `query_ideas`, `update_idea`, `batch_create_ideas` (Phase 1: CPO runs ideaify)
- **Intake Processor** (Phase 2): gets `create_idea`, `query_ideas`, `batch_create_ideas` (no `update_idea` -- only CPO triages)

---

## Open Questions

### 1. Trigger Mechanism

How does ideaify get invoked? Options:

| Mechanism | Pros | Cons |
|-----------|------|------|
| **CPO recognises messy input and runs ideaify manually** (Phase 1) | Zero infrastructure. Works today. | Requires CPO to decide when to use ideaify vs handle directly. Adds cognitive load. |
| **Gateway pre-processes all inbound messages through ideaify** | CPO always receives clean ideas. Consistent. | All messages go through an extra processing step, even clean ones. Adds latency. |
| **Gateway tags messages as "needs-processing" and the CPO runs ideaify on tagged ones** | Best of both worlds. Clean messages skip processing. | Requires the gateway to make a judgment call about message cleanliness. |
| **Separate inbox endpoint (e.g., /ideas) that always runs ideaify** | Clear intent -- submitter knows they're dumping raw input. | New endpoint to build and maintain. |

**Recommendation:** Phase 1 uses the first option. The CPO is already the entry point for all human communication. When it receives a message that is clearly messy (voice transcription, multi-topic dump), it runs ideaify. When it receives a clean "fix the favicon" message, it skips ideaify and uses `standalone-job` directly. This mirrors how a human CPO would work — you do not run every casual message through a formal intake process.

### 2. Voice Transcription Quality

Ideaify assumes it receives text. But voice notes need transcription first. Questions:

- Does transcription happen before ideaify (separate step in the gateway)?
- Does ideaify accept audio and handle transcription internally?
- What transcription service? (Whisper, Deepgram, platform-native)

**Recommendation:** Transcription is a gateway concern, not an ideaify concern. The gateway converts voice to text before delivering to the agent. Ideaify receives text with `source_type: voice` so it knows the input may have transcription artifacts (misheard words, no punctuation, run-on sentences) and adjusts its cleaning accordingly.

### 3. Batch Processing vs Real-Time

Should ideaify process ideas one at a time as they arrive, or batch them?

**Recommendation:** Real-time in Phase 1 (CPO processes each message as it arrives). The batch use case (process a whole meeting transcript, parse a week of Slack messages) is Phase 2 territory and is naturally handled by the contractor model — dispatch an intake-processor contractor with a batch of inputs.

### 4. Ideas Inbox Lifecycle and Hygiene

How long do ideas stay in the inbox? What prevents it from becoming a graveyard?

**Recommendation:** Build hygiene into the CPO's existing standup rhythm.
- During standup, report `new` idea count.
- If ideas older than 7 days are still `new`, flag them.
- `parked` ideas are reviewed monthly during sprint planning.
- `rejected` ideas are archived after 30 days (soft delete or status change).

This is a process concern, not an ideaify concern -- but ideaify's design (simple status lifecycle, timestamps) enables the hygiene process.

### 5. Cross-Company Ideas

The current data model is company-scoped. Should ideas ever cross company boundaries?

**Recommendation:** No. Ideas are company-scoped. If a platform-level idea emerges (e.g., "add a new agent role"), it belongs to the platform company's inbox (the zazig company itself). Standard RLS isolation applies.

### 6. Interaction with Entry Point C (Agent-Initiated)

The Monitoring Agent already produces structured proposals via the `internal-proposal` skill. Should agent-discovered opportunities also flow through ideaify?

**Recommendation:** No. Agent-initiated ideas are already structured — they come through the research-and-proposal pipeline with evidence, feasibility assessment, and a recommendation. Running them through ideaify would strip context. The Monitoring Agent's proposals should enter the inbox directly with `source_type: agent_discovered` and pre-populated categorisation, skipping the cleaning step but benefiting from the inbox's triage workflow.

---

## Phased Rollout

### Phase 1: Skill + Table (Immediate)

- Create the `ideas` table (migration)
- Build the 4 MCP tools (`create_idea`, `query_ideas`, `batch_create_ideas`, `update_idea`)
- Write the `ideaify.md` skill file
- CPO runs ideaify manually when needed
- CPO triages the inbox as part of standup
- **Effort:** 1 feature, approximately 5-7 jobs

### Phase 2: Contractor Role (When volume justifies it)

- Register `intake-processor` contractor role
- Add gateway trigger: messy inputs auto-dispatch intake-processor
- CPO receives notifications of new processed ideas, not raw input
- **Trigger for Phase 2:** CPO is spending >20% of its context window on input parsing

### Phase 3: Smart Inbox (Future)

- Priority suggestions based on patterns (frequently requested things bubble up)
- Automatic linking of related ideas across time ("users asked for dark mode 5 times this month")
- Trend detection across ideas ("3 ideas this week about performance -- pattern?")
- **Trigger for Phase 3:** Inbox has >50 ideas and manual pattern detection is insufficient

---

## Scope Boundaries

- **In scope:** Ideaify skill design, Ideas Inbox table, MCP tools, CPO triage workflow, Phase 1 implementation plan
- **Out of scope:** Gateway changes, voice transcription, batch processing infrastructure, intake-processor contractor role (Phase 2), smart inbox features (Phase 3)
- **Not changing:** The existing pipeline stages 1-7, CPO routing logic, existing skills (jobify, featurify, spec-feature, etc.)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Ideaify miscategorises ideas, CPO wastes time correcting | Medium | Low | CPO always reviews. Bad categorisation is annoying, not dangerous. Improve skill prompt over time. |
| Ideas inbox becomes a graveyard of unreviewed items | Medium | Medium | Build review cadence into standup. Alert on age of `new` items. |
| Duplicate detection produces false positives, creates noise | Low | Low | Flag as "potential duplicate" with evidence. CPO decides. Never auto-merge. |
| Multi-idea splitting loses context | Medium | Medium | Splitting rules are conservative (when in doubt, don't split). Source input always preserved. |
| Ideaify expands scope into analysis, competing with CPO | Low | High | Hard constraint in skill prompt: "do not analyse, do not recommend, do not prioritise." Review skill prompt periodically. |

---

## Success Criteria

1. **CPO spends less context on parsing.** Measurable: compare CPO conversation length for messy inputs before and after ideaify.
2. **Ideas have better traceability.** Every feature can trace back to the original idea and the original raw input.
3. **Multi-idea inputs are reliably split.** A 5-topic voice note produces 5 inbox items, not 1.
4. **No ideas are lost.** Everything submitted ends up in the inbox, even if poorly categorised.
5. **CPO triage is faster.** Pre-categorised, pre-tagged ideas are faster to review than raw input.
