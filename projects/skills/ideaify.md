# Ideaify

**Role:** Any agent receiving raw unstructured input (Phase 1: CPO; Phase 2: Intake Processor contractor)
**Pattern:** Skill Pattern — injected into the running agent's prompt when raw input needs processing.

You are processing raw, unstructured input into clean, categorised idea records for the Ideas Inbox. Your job is data cleaning and categorisation, not product judgment. You produce structured idea records. The CPO decides what to do with them.

---

## What This Skill Does

- Reads and understands raw input of any quality — voice note transcriptions, Slack messages, meeting transcripts, text dumps, or terse one-liners
- Splits multi-idea input into individual idea records with conservative rules: when in doubt, do not split. Each split idea must stand alone with enough context to be understood without reference to its siblings. Annotates relationships between split ideas via `related_ideas`.
- Cleans each idea into a clear `title` (under 80 characters, specific) and `description` (1-3 paragraphs of clean prose — not raw copy-paste from the input). Captures motivation and context if present in the input; does not add analysis.
- Categorises each idea across four dimensions with signal guidance (see Step 4):
  - **Scope:** `job` / `feature` / `initiative` / `project` / `unknown`
  - **Complexity:** `trivial` / `small` / `medium` / `large` / `unknown`
  - **Domain:** `product` / `engineering` / `marketing` / `cross-cutting` / `unknown`
  - **Autonomy:** `exec-can-run` / `needs-human-input` / `needs-human-approval` / `unknown`
- Tags each idea with domain tags, area tags, source tags, and signal tags (e.g. `urgent`, `quick-win`)
- Flags ambiguity with specific `clarification_notes` — scope unclear, domain ambiguous, potential duplicate, vague input
- Checks for duplicates by querying `query_ideas` and `query_features` — flags potential overlaps in `related_ideas` and `related_features`, never auto-merges
- Writes structured idea records to the Ideas Inbox via `create_idea` (single) or `batch_create_ideas` (multiple, preferred for split inputs)
- Preserves the verbatim original input in the `raw_text` field of every record — no idea is ever lost
- Outputs a processing summary after all ideas are written: "Processed N ideas from [source] by [originator]: [list]"

## What This Skill Does NOT Do

- **Does not judge whether ideas are good or bad** — evaluation is the CPO's role
- **Does not research feasibility or check the codebase** — investigation is a research contractor's role
- **Does not prioritise ideas** — prioritisation is the CPO's role at triage time
- **Does not create features, jobs, or projects** — those are downstream pipeline actions owned by the CPO
- **Does not ask for clarification** — it flags what's unclear and moves on. Ideaify is designed for async input; interactive clarification breaks the model.
- **Does not process non-English input beyond best effort** — for v1, English only. If input appears to be non-English, add `needs-clarification` to `flags` and process as best it can.

---

## Prerequisites

Before you start, you should have:

1. **Raw input text** — the unstructured content to process (any quality, any length)
2. **Source metadata** — where it came from (`source`: `terminal`, `slack`, `telegram`, `agent`, `web`, `api`, `monitoring`) and who submitted it (`originator`: `human`, `cpo`, `cto`, `cmo`, `monitoring-agent`, etc.)
3. Access to **MCP tools**: `create_idea`, `batch_create_ideas`, `query_ideas`, `query_features`, `query_projects`

If any prerequisite is missing, stop and report the gap. Do not improvise.

---

## Procedure

### Step 1: Read and Understand the Input

Read the raw input in full before doing anything else. Determine:

- How many distinct ideas are present? (Could be 1, could be 10)
- Is the input coherent or rambling?
- What is the general domain? (product, engineering, marketing, mixed)
- Are there signals of urgency, specific people mentioned, or prior context assumed?

If the input is a single, clear idea, skip to Step 3.

### Step 2: Split Multi-Idea Input

If the input contains multiple distinct ideas, separate them.

**Splitting rules:**
- One idea per record. Independent topics get their own record.
- Preserve context. If an idea references another ("and for that auth system, also…"), include enough context in the split idea to make it standalone — the sibling idea will not be visible when the CPO reads one record in isolation.
- **When in doubt, do not split.** "Add dark mode and also a theme picker" is one idea — two aspects of the same feature. "Fix the login bug and also add analytics" is two ideas — genuinely independent topics with no shared scope.
- Annotate relationships. After creation, update each split idea's `related_ideas` to cross-reference all siblings from the same input.

For each identified idea, proceed through Steps 3–6 independently.

### Step 3: Clean Each Idea

Transform the raw text into a structured idea:

**Title:** One line, under 80 characters. Clear and specific.
- Good: `"Add OAuth support for Google and GitHub"`
- Bad: `"auth stuff"`
- Bad: `"We should probably think about maybe adding some kind of login thing with Google"`

**Description:** 1-3 paragraphs of clean prose.
- What the idea is (concrete, not vague)
- Why it might matter (if the input hints at motivation)
- Any constraints or context mentioned in the input
- Do NOT add your own analysis or recommendations
- Do NOT copy-paste raw text from the input

### Step 4: Categorise Each Idea

Assess each idea across all four dimensions. Every assessment must include brief reasoning — do not just pick a value at random.

**Scope — how big is this?**

| Value | Signal |
|-------|--------|
| `job` | Single fix, one file change, under 30 minutes. "Fix the typo on the landing page." |
| `feature` | Defined capability, multiple jobs. "Add dark mode to the dashboard." |
| `initiative` | Multiple features, shared theme. "Rebuild the authentication system." |
| `project` | New product, new repo, multi-month effort. "Build a mobile app." |
| `unknown` | Not enough detail to assess. Flag for clarification. |

**Complexity — how hard?**

| Value | Signal |
|-------|--------|
| `trivial` | Well-defined, mechanical, no ambiguity — under 15 minutes |
| `small` | Clear implementation, single component, minimal judgment needed |
| `medium` | Multiple components, some judgment needed, cross-file changes |
| `large` | Architecture decisions, cross-cutting concerns, significant unknowns |
| `unknown` | Cannot assess from the input alone — flag for clarification |

**Domain — whose portfolio?**

| Value | Signal |
|-------|--------|
| `product` | User-facing features, UX changes, roadmap items → CPO |
| `engineering` | Infrastructure, performance, security, tech debt → CTO |
| `marketing` | Positioning, growth, content, branding → CMO |
| `cross-cutting` | Touches multiple domains. Note which ones in `clarification_notes`. |
| `unknown` | Ambiguous — flag for clarification |

**Autonomy — can an exec just run with it?**

| Value | Signal |
|-------|--------|
| `exec-can-run` | Clear enough that the responsible exec can proceed without asking the human |
| `needs-human-input` | Requires human preferences, brand decisions, or domain knowledge the exec lacks |
| `needs-human-approval` | Significant scope, cost, or strategic impact — exec should propose, human approves |
| `unknown` | Cannot determine without more context |

### Step 5: Flag Potential Duplicates (Lightweight)

Before writing, note any obvious overlaps from your existing context:
- If you already know about similar ideas or features from the current
  session, flag them in `clarification_notes`
- Add `potential-duplicate` to `flags` if you suspect overlap

**Do NOT fire `query_ideas` or `query_features` for duplicate checking
inline.** These are heavy reads that blow up context. The contractor
that writes the ideas to the inbox (Step 7) performs the full duplicate
check against the database.

**Do NOT decide whether it is a duplicate.** Flag it and let the CPO decide.

### Step 6: Tag Each Idea

Apply tags based on what you can determine from the input:

- **Domain tags:** `product`, `engineering`, `marketing`
- **Area tags:** `auth`, `ui`, `performance`, `security`, `database`, `infra`, `mobile`, `dashboard`, etc.
- **Source tags:** `voice-note`, `slack`, `meeting-transcript`, `terminal`, `telegram`, etc.
- **Signal tags:** `urgent` (if the input conveys urgency), `quick-win` (if trivially small and well-defined)

Keep tags lowercase and hyphenated. Do not invent unusual tags — prefer common vocabulary above.

### Step 7: Write to the Ideas Inbox

**Who runs this step depends on context:**

- **If you have direct MCP access** (e.g. you ARE the contractor):
  Call `create_idea` for a single idea, or `batch_create_ideas` for
  multiple. Run full duplicate checks via `query_ideas` + `query_features`
  before writing.

- **If you are the CPO (exec context):** Dispatch a contractor via
  `request_work` to write the structured ideas to the inbox. Pass the
  contractor the structured idea records from Steps 1-6 as the job spec.
  The contractor handles duplicate checking and DB writes, keeping your
  context clean.

Each idea record must include:

| Field | Value |
|-------|-------|
| `raw_text` | Verbatim original input — always, without modification |
| `title` | Cleaned title, under 80 chars |
| `description` | 1-3 paragraphs of clean prose |
| `scope` | From Step 4 |
| `complexity` | From Step 4 |
| `domain` | From Step 4 |
| `autonomy` | From Step 4 |
| `tags` | From Step 6 |
| `flags` | `needs-clarification`, `potential-duplicate`, `multi-idea-split` (as applicable) |
| `clarification_notes` | Specific notes on what could not be determined and why |
| `related_ideas` | UUIDs of sibling ideas (for split inputs — update after creation) |
| `related_features` | UUIDs of potentially overlapping features (from Step 5) |

After creation, if the input was split: call `update_idea` on each record to add `related_ideas` cross-references to all siblings.

### Step 8: Output Summary

After all ideas are written (or dispatched), output a processing summary:

```
Processed N ideas from [source] by [originator]:
- "Title 1" (scope: feature, domain: product) [flags if any]
- "Title 2" (scope: job, domain: engineering)
- "Title 3" (scope: unknown, domain: unknown) [needs-clarification: vague input]
```

---

## Quality Checklist

Before writing (or dispatching) to the inbox, verify for each idea:

- [ ] Title is under 80 characters and specific (not vague or a copy-paste fragment)
- [ ] Description is clean prose — not raw copy-paste from the input
- [ ] Scope assessment has reasoning (not a random pick)
- [ ] If split from multi-idea input, the idea stands alone without context from siblings
- [ ] Source input preserved verbatim in the `raw_text` field
- [ ] Potential duplicates flagged from session context (full DB check runs at write time)
- [ ] Flags applied where uncertainty exists — do not pretend to be certain when you are not

---

## MCP Tools Used

**By CPO (exec context):**

| Tool | Purpose | When |
|------|---------|------|
| `request_work` | Dispatch contractor to write ideas to inbox | Step 7 |
| `create_idea` | Quick one-off capture during conversation | Ad hoc |

**By contractor (write context):**

| Tool | Purpose | When |
|------|---------|------|
| `query_ideas` | Full duplicate check against existing ideas | Step 7 |
| `query_features` | Check if similar features exist | Step 7 |
| `query_projects` | Check if the idea fits an existing project | Step 7 |
| `create_idea` | Write a single processed idea to the inbox | Step 7 |
| `batch_create_ideas` | Write multiple ideas atomically | Step 7 |

---

## Key Constraint: Categorisation Is a Guess, Not a Decision

Every value ideaify assigns — scope, complexity, domain, autonomy — is an informed estimate, not a product decision. The CPO reviews every idea at triage time and may change any of these values. Ideaify's job is to give the CPO a structured head start, not to make calls on its behalf.

If you find yourself reasoning about whether an idea is worth building, whether the timing is right, or whether the effort is justified — stop. That is the CPO's job. Categorise what you have and move on.

---

## Examples

### Example 1: Single Clean Idea

**Input:**
```
source: terminal
originator: tom
text: "We should add dark mode to the dashboard. Users keep asking for it."
```

**Processing:**
- 1 distinct idea — no split needed
- Duplicate check: `query_ideas` for "dark mode" → no results; `query_features` for "dark mode" → no results

**Output (1 record):**
```
title: "Add dark mode to the dashboard"
description: "Users have been requesting dark mode for the dashboard UI. This would
  introduce a dark colour scheme as an alternative to the current light theme,
  toggled via user preference and persisted in their profile settings."
scope: feature
complexity: medium
domain: product
autonomy: needs-human-input
tags: [ui, dashboard, product, user-request]
flags: []
clarification_notes: null
raw_text: "We should add dark mode to the dashboard. Users keep asking for it."
```

**Summary:**
```
Processed 1 idea from terminal by tom:
- "Add dark mode to the dashboard" (scope: feature, domain: product)
```

---

### Example 2: Messy Multi-Idea Voice Note

**Input:**
```
source: voice-note
originator: tom
text: "OK so I was thinking about a few things. First, the login page is broken on
  Safari — like the button doesn't render properly, we need to fix that. Also I've
  been thinking we should probably add some kind of analytics to track user
  engagement, nothing fancy, just page views and session duration. Oh and Chris
  mentioned that the deployment pipeline is really slow, takes like 20 minutes, we
  should look into that. Actually one more thing — for the marketing site, we should
  probably have a changelog page where we post updates about new features."
```

**Processing:**
- 4 distinct ideas identified: Safari bug, analytics, deployment speed, changelog
- Each is genuinely independent — no shared scope or dependency between them
- Duplicate check performed for each via `query_ideas` + `query_features` — no overlaps found
- All 4 written via `batch_create_ideas`; `related_ideas` updated on each to cross-reference siblings

**Output (4 records):**

```
Idea 1:
  title: "Fix login button rendering on Safari"
  description: "The login page button does not render correctly on Safari browsers.
    Likely a CSS compatibility issue. Needs investigation and a fix to ensure the
    login flow works reliably across all major browsers."
  scope: job
  complexity: trivial
  domain: engineering
  autonomy: exec-can-run
  tags: [bug, safari, login, ui, engineering]
  flags: [multi-idea-split]
  related_ideas: [idea-2-uuid, idea-3-uuid, idea-4-uuid]
  raw_text: "[full verbatim voice note text]"

Idea 2:
  title: "Add basic user engagement analytics (page views, session duration)"
  description: "Add lightweight analytics to track user engagement across the
    application. Specific metrics requested: page views and session duration. The
    intent is baseline visibility into how users interact with the product — not a
    full analytics suite."
  scope: feature
  complexity: medium
  domain: product
  autonomy: needs-human-input
  tags: [analytics, tracking, user-engagement, product]
  flags: [needs-clarification, multi-idea-split]
  clarification_notes: "Scope boundaries unclear — 'nothing fancy' suggests minimal
    implementation, but analytics can expand quickly. Human should confirm: which
    pages, which metrics exactly, third-party tool (e.g. PostHog, Plausible) or
    homebrew implementation?"
  related_ideas: [idea-1-uuid, idea-3-uuid, idea-4-uuid]
  raw_text: "[full verbatim voice note text]"

Idea 3:
  title: "Investigate and improve deployment pipeline speed"
  description: "The deployment pipeline currently takes approximately 20 minutes,
    which is perceived as too slow. Needs investigation to identify bottlenecks and
    potential optimisations. The fix could be simple (caching, parallelisation) or
    architectural — research is needed to determine the actual scope."
  scope: feature
  complexity: unknown
  domain: engineering
  autonomy: exec-can-run
  tags: [infrastructure, ci-cd, performance, deployment, engineering]
  flags: [needs-clarification, multi-idea-split]
  clarification_notes: "Complexity unknown — could be a quick caching fix or a
    fundamental pipeline restructure. A research phase is needed before this can
    be scoped properly."
  related_ideas: [idea-1-uuid, idea-2-uuid, idea-4-uuid]
  raw_text: "[full verbatim voice note text]"

Idea 4:
  title: "Add a changelog page to the marketing site"
  description: "A public-facing page on the marketing site listing feature updates
    and releases. Keeps users informed about product development and supports
    transparency. Content would be posted manually after each significant release."
  scope: feature
  complexity: small
  domain: marketing
  autonomy: needs-human-input
  tags: [marketing-site, changelog, content, marketing]
  flags: [multi-idea-split]
  related_ideas: [idea-1-uuid, idea-2-uuid, idea-3-uuid]
  raw_text: "[full verbatim voice note text]"
```

**Summary:**
```
Processed 4 ideas from voice-note by tom:
- "Fix login button rendering on Safari" (scope: job, domain: engineering)
- "Add basic user engagement analytics (page views, session duration)" (scope: feature, domain: product) [needs-clarification]
- "Investigate and improve deployment pipeline speed" (scope: feature, domain: engineering) [needs-clarification]
- "Add a changelog page to the marketing site" (scope: feature, domain: marketing)
```

---

### Example 3: Vague One-Liner

**Input:**
```
source: slack
originator: chris
text: "we should make the app faster"
```

**Processing:**
- 1 idea — no split
- Duplicate check: `query_ideas` for "performance" + `query_features` for "performance" → no results

**Output (1 record):**
```
title: "Improve application performance"
description: "General request to improve the application's speed. No specific page,
  flow, or metric has been identified in the input. The request may refer to page
  load time, API response latency, build time, or overall perceived responsiveness."
scope: unknown
complexity: unknown
domain: engineering
autonomy: needs-human-input
tags: [performance, engineering]
flags: [needs-clarification]
clarification_notes: "Input too vague to categorise. Clarification needed: which part
  of the app? What is the current performance baseline? What is the target? Is this
  about page load time, API response time, build time, or something else?"
raw_text: "we should make the app faster"
```

**Summary:**
```
Processed 1 idea from slack by chris:
- "Improve application performance" (scope: unknown, domain: engineering) [needs-clarification]
```
