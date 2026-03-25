# How the Idea Pipeline Works

**Audience:** Founders using zazig
**Last updated:** 2026-03-01

---

## The Big Picture

You have an idea. You tell your CPO. It becomes a feature. Your team builds it. You see the whole thing happen on the dashboard.

```
YOU ──→ CAPTURE ──→ TRIAGE ──→ SPEC ──→ BREAKDOWN ──→ BUILD ──→ SHIP
 💬        📥         🔍        📋        🔨           🏗️        🚀
```

Every step is visible. Nothing disappears into a black box.

---

## 1. Capture: Getting Ideas Into the System

You can record ideas through any of these channels:

| Channel | How | What happens |
|---------|-----|-------------|
| **Terminal** | Talk to your CPO in a conversation | CPO captures it as an idea instantly |
| **Telegram** | Send a text or voice note to the Telegram bot | Bot transcribes voice, creates an idea record |
| **Slack** | Message in your Slack channel | Routed into the ideas inbox |
| **Dashboard** | (Future) Submit directly from the web UI | Creates idea record |

**Voice notes work.** Record a rambling 2-minute voice note on Telegram while walking. The bot transcribes it and the CPO will make sense of it later.

**Multi-idea inputs get split.** If you say "fix the login bug, and also we need analytics, oh and dark mode would be nice" — that becomes 3 separate idea records, each tracked independently.

### What gets recorded

Every idea captures:
- **raw_text** — your exact words, never modified
- **originator** — who said it (you, or your CPO if it generated the idea)
- **source** — where it came from (terminal, telegram, slack, etc.)
- **title + description** — cleaned-up version (added by processing)

---

## 2. Processing: From Messy to Structured

Raw input gets cleaned up by the **ideaify** skill. This is automatic — you don't need to do anything.

Ideaify does:
- **Splits** multi-idea inputs into individual records
- **Cleans** each idea into a clear title + description
- **Categorises** by scope (job, feature, initiative), complexity, and domain
- **Tags** with relevant metadata
- **Flags** anything ambiguous: "scope unclear", "may overlap with existing feature X"

Ideaify does NOT:
- Decide if an idea is good or bad
- Prioritise anything
- Ask you for clarification (it flags gaps and moves on)

---

## 3. Triage: Your CPO Reviews Everything

Your CPO sweeps the inbox at the start of every conversation and during standups. For each new idea, the CPO:

1. Reviews the title, description, flags, and any clarification notes
2. Refines if needed — updates the description, adds tags
3. Sets priority (low / medium / high / urgent)
4. Recommends an action: **promote**, **park**, or **reject**
5. Presents the recommendation to you

**You make the final call.** The CPO never promotes an idea without your explicit approval.

### What the recommendations mean

| Action | What it means | What happens next |
|--------|--------------|-------------------|
| **Promote → Feature** | Worth building | Creates a feature record, enters the spec pipeline |
| **Promote → Job** | Small enough for a standalone task | Creates a job, goes straight to the build queue |
| **Promote → Research** | Interesting but needs investigation | CPO commissions a research contractor to dig deeper |
| **Park** | Not now, maybe later | Stays in the parking lot, reviewed periodically |
| **Reject** | Not doing this | Archived with a reason, preserved for context |

### Idea lifecycle

```
                  ┌──→ promoted (→ feature / job / research)
                  │
new ──→ triaged ──┼──→ parked
                  │
                  └──→ rejected

parked ──→ triaged  (resurfaced later)
parked ──→ rejected (killed)
```

---

## 4. Spec: Designing What Gets Built

Once an idea is promoted to a feature, it enters the **spec pipeline**. Your CPO writes the spec using the `/spec-feature` skill:

- **Description** — what the feature does, in plain language
- **Acceptance criteria** — how you'll know it works (user-facing, not technical)
- **Human checklist** — things you need to manually verify on a test server

The spec is a conversation between you and the CPO. The CPO drafts, you review, iterate until it's right.

When the spec is approved, the CPO sets the feature status to `ready_for_breakdown`.

---

## 5. Breakdown: Feature → Jobs

The **Breakdown Specialist** (an ephemeral contractor) takes your specced feature and decomposes it into executable jobs using the `jobify` skill.

Each job gets:
- A self-contained spec (everything an engineer needs to build it)
- Gherkin acceptance tests (machine-verifiable pass/fail criteria)
- Complexity rating (simple / medium / complex)
- Dependencies (which jobs must finish first)

A typical feature produces 3-8 jobs arranged in a dependency graph (DAG). Simple jobs run in parallel; complex ones chain sequentially.

**You don't need to do anything here.** Breakdown is fully automated.

---

## 6. Build: Jobs Get Executed

The **orchestrator** dispatches jobs to available worker slots on your machines. Workers (Claude Code or Codex) execute each job:

1. Clone the repo into an isolated worktree
2. Read the job spec and acceptance tests
3. Write code
4. Run the acceptance tests
5. Push to a feature branch

Jobs execute in dependency order. When all jobs for a feature complete, results get combined into a single branch.

---

## 7. Verify & Ship

Two verification gates:

1. **Code review** — automated multi-agent review (security, performance, architecture, simplicity)
2. **Feature verification** — your human checklist items, tested on a staging server

When verification passes, a PR is created. You (or your CPO) merge it.

---

## The Dashboard: See Everything

The pipeline dashboard at `dashboard/index.html` shows the full lifecycle across 11 columns:

### Intake columns (left side)

| Column | What's here | Data source |
|--------|------------|-------------|
| **Ideas** | Raw ideas, status `new` — just captured, nobody's looked yet | `ideas` table |
| **Triage** | Ideas reviewed by CPO with a recommendation badge (promote/park/reject) | `ideas` table |
| **Proposal** | Promoted features being specced, not yet ready for breakdown | `features` table, status `created` |

### Build pipeline columns (right side)

| Column | What's here |
|--------|------------|
| **Ready** | Specced and waiting for breakdown |
| **Breakdown** | Being decomposed into jobs |
| **Building** | Jobs actively executing |
| **Combining** | Job results being merged |
| **Verifying** | Under review / testing |
| **Shipped** | PR ready or complete |
| **Failed** | Something went wrong |

### Parking lot

Below the board, a collapsible **Parked** section shows ideas set aside for later. Grouped by age (this week, this month, older, stale >90 days).

### Clicking a card

Click any card to open the detail panel:
- **Idea cards** → metadata, description, triage notes, flags
- **Feature cards** → spec, acceptance criteria, job list with statuses, logs

### The visual divider

A subtle `›` divider separates intake (ideas, triage, proposal) from the build pipeline (ready → shipped). This shows where human thinking ends and machine building begins.

---

## Skills: What the CPO Already Knows

Your CPO has 12 skills loaded. It knows how to run every ceremony and process without being told. Here's what triggers each:

| Trigger | Skill invoked | What it does |
|---------|--------------|-------------|
| Start of every conversation | **standup** | Sweeps ideas inbox, checks pipeline health, reports status |
| "Let's plan the sprint" | **scrum** | Triage features, prioritise work, schedule breakdown |
| Messy multi-idea input | **ideaify** | Splits, cleans, categorises, writes to inbox |
| Single idea worth a deep-dive | **internal-proposal** | Problem → hypothesis → solution RFC document |
| Feature needs a spec | **spec-feature** | Writes spec + acceptance criteria + human checklist |
| Reviewing someone else's plan | **review-plan** | Structured critique with recommendations |
| Unsure about a decision | **second-opinion** | Cross-model validation (asks a different AI to check) |
| Analysing an external repo | **repo-recon** | Deep technical analysis of another codebase |
| Need to notify the team | **slack-headsup** | Sends a summary to Slack after producing an artifact |
| Solved a non-trivial problem | **compound-docs** | Captures problem-solution knowledge for future reference |
| Session error tracking | **napkin** | Maintains per-repo notes on corrections and patterns |
| New design/feature work | **brainstorming** | Structured exploration before committing to an approach |

### The CPO's standing orders

Every session, automatically:
1. Read the napkin (accumulated learnings)
2. Sweep the ideas inbox for new items
3. Check pipeline health (stuck features, zombie jobs)
4. Present status before doing anything else

You don't need to ask for this. It happens.

---

## MCP Tools: How Agents Talk to the Database

These are the tools your CPO (and other agents) use to interact with the system:

| Tool | What it does | Who uses it |
|------|-------------|-------------|
| `create_idea` | Add a new idea to the inbox | Any agent, capture adapters |
| `query_ideas` | Search/filter ideas | CPO, dashboard |
| `update_idea` | Change triage fields (status, priority, tags) | CPO |
| `promote_idea` | Graduate idea → feature or job | CPO (with your approval) |
| `batch_create_ideas` | Insert multiple ideas at once | Ideaify (for multi-idea splits) |
| `create_feature` | Create a new feature | CPO |
| `update_feature` | Update spec, status, acceptance criteria | CPO |
| `query_features` | List features with filters | CPO, dashboard |
| `query_jobs` | List jobs for a feature | CPO, dashboard |
| `get_pipeline_snapshot` | Quick pipeline health summary (~500 tokens) | CPO (standup) |
| `request_work` | Commission a contractor (technician, architect, etc.) | CPO |
| `query_idea_status` | Trace an idea through the full pipeline chain | CPO |

---

## End-to-End Example

Here's what happens when you have an idea:

```
1. You tell your CPO: "We need better error messages for API failures"

2. CPO captures it:
   → create_idea(raw_text="better error messages for API failures",
                 originator="chris", source="terminal")
   → "Captured as idea in the inbox."

3. Dashboard: Card appears in IDEAS column

4. CPO triages (same conversation or next standup):
   → Reviews → Sets priority: medium → Recommends: promote to feature
   → "This looks like a single feature. Want me to promote it?"

5. You say yes:
   → promote_idea(idea_id=..., promote_to="feature", project_id=...)
   → Feature record created, status: "created"

6. Dashboard: Card moves from TRIAGE to PROPOSAL

7. CPO specs the feature (using /spec-feature):
   → Writes spec, acceptance criteria, human checklist
   → "Here's the spec. Look right?"

8. You approve, CPO sets status to ready_for_breakdown

9. Dashboard: Card moves to READY

10. Orchestrator dispatches Breakdown Specialist:
    → jobify produces 4 jobs with dependency graph
    → Dashboard: Card moves to BREAKDOWN, then BUILDING

11. Workers execute jobs → code on branches
    → Dashboard: Card moves through BUILDING → COMBINING → VERIFYING

12. You verify on test server using the human checklist

13. PR merged → Dashboard: Card moves to SHIPPED ✓
```

Total time from idea to shipped: depends on complexity. A simple fix can go from idea to shipped in hours. A multi-feature initiative takes days.

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Record an idea | Tell your CPO, or send a Telegram message |
| See all my ideas | Open the dashboard, look at IDEAS + TRIAGE columns |
| Check what's being built | Dashboard → BUILDING column |
| See parked ideas | Dashboard → expand Parked section below the board |
| Track a specific idea | Ask CPO to run `query_idea_status` with the idea ID |
| Prioritise work | Ask for a scrum / sprint planning session |
| Get a status update | Ask for a standup, or just start a conversation (standup runs automatically) |
| Deep-dive an idea before building | Ask CPO to write an internal proposal |
| Understand a competitor | Ask CPO to run repo-recon on their GitHub |
