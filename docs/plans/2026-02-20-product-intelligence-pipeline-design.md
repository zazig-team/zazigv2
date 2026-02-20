# Product Intelligence Pipeline — Design Document

**Date:** 2026-02-20
**Status:** proposed
**Authors:** Tom (owner), CPO (agent)

---

## Problem

Execs in a real company don't operate in a vacuum — they have multiple responsibilities, including staying informed about their market. Today, the CPO plans features based on the owner's intuition and whatever context is manually provided. There's no systematic external intelligence: no monitoring of competitors, no awareness of trending discussions in the product's domain, no discovery of relevant open-source repos that could inform or challenge the roadmap.

The owner currently does this manually: commissioning deep-research, running second-opinions, discovering GitHub repos, running repo-recon, synthesizing findings, and deciding what to build. This works but doesn't scale — and it only happens when the owner thinks to do it.

## Solution

Add a **product intelligence pipeline** to zazigv2 — two new ephemeral agent roles that automate market monitoring and research, feeding the CPO's planning work.

1. **Market Researcher** — Scheduled ephemeral agent. Runs daily, scans external sources aligned to active roadmaps, surfaces notable signals.
2. **Product Manager** — On-demand ephemeral agent. Commissioned by CPO when a signal warrants deep investigation. Runs a multi-stage research pipeline, collaborates with CPO, and produces actionable cards.

Both roles are function-agnostic infrastructure — while the CPO uses them for product intelligence, the same pipeline could serve a CMO (marketing landscape) or CTO (technology radar) with different roadmap inputs and review criteria.

---

## Architecture

### Where It Fits in zazigv2

```
┌──────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR (Supabase)                    │
│                                                                │
│  Existing:                    New:                             │
│  ┌──────────────────┐        ┌──────────────────┐             │
│  │ Card-driven jobs │        │ Cron scheduler   │             │
│  │ (poll task board) │        │ (daily researcher)│             │
│  └──────────────────┘        └──────────────────┘             │
│           │                           │                        │
│           ▼                           ▼                        │
│  ┌──────────────────────────────────────────┐                 │
│  │         Job dispatch (Realtime)           │                 │
│  └──────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
    ┌─────────────┐          ┌─────────────┐
    │ Local Agent  │          │ Local Agent  │
    │ (ephemeral)  │          │ (CPO host)   │
    │              │          │              │
    │ Researcher   │          │ CPO          │
    │ or PM        │          │ (persistent) │
    └─────────────┘          └─────────────┘
```

- **Market Researcher** is a new job type: `cron` (schedule-driven), not `card-driven`
- **Product Manager** is a standard `card-driven` job — CPO creates a `research` card, orchestrator dispatches
- CPO remains the sole persistent agent
- PM ↔ CPO collaboration uses inter-agent messaging (claude-send initially, Realtime channels later)

### Agent Roles

| Role | Type | Trigger | Lifecycle | Purpose |
|------|------|---------|-----------|---------|
| Market Researcher | Ephemeral | Cron (daily) | ~15-30 min per run | Scan external sources, surface signals |
| Product Manager | Ephemeral | Card-driven (CPO creates card) | ~30-60 min per pipeline | Deep research pipeline, collaborate with CPO, produce cards |

---

## Market Researcher — Daily Scan

### Schedule

Orchestrator fires the researcher once daily (configurable, default 06:00 UTC — before CPO's first standup). New orchestrator job type: `cron`. Uses one ephemeral slot.

### Input

The researcher reads two things before scanning:

1. **Active roadmaps** — Fetches each project's `docs/ROADMAP.md` (synced to Supabase from repos). Extracts keywords, domains, competitor names, technology choices. This scopes the scan to what the company actually cares about.
2. **Previous signals** — Queries the `signals` table for prior output. Prevents re-surfacing the same discussion thread or repo.

### Scan Flow

1. **Build search queries** from roadmap phases — e.g., if a project's roadmap mentions "version control for writers", search for writing tools, version control UX, competitor launches
2. **GitHub** (API) — Search repos by topic/keywords, filter by recent activity (stars, commits, forks in last 7 days). Flag repos that are new, growing fast, or directly competing
3. **Web sources** (web search + Firecrawl) — Reddit, X, YouTube, Hacker News, relevant blogs. Search for domain keywords, product names, competitor names
4. **Score each signal** — Relevance to a specific roadmap phase (high/medium/low), novelty (new vs already known), urgency (competitor launch vs general discussion)
5. **Deduplicate** against previous signals — Same URL, same repo, same thread = skip
6. **Write signals** to Supabase `signals` table
7. **Generate daily digest** — Top signals grouped by project, stored for CPO standup prep

### Pluggable Source Integrations

Each source is a module. The researcher iterates over enabled source modules from the `source_configs` table.

**Default (no API keys needed):**
- `github-api` — GitHub search API (authenticated via existing GitHub token)
- `web-search` — General web search via deep-research / Firecrawl

**Optional (user adds API key to unlock):**
- `twitter` — Structured Twitter/X feed monitoring. Better signal-to-noise than web search.
- `reddit` — Reddit API for subreddit monitoring. Free tier available.
- `youtube` — YouTube Data API for video/channel tracking. Free quota.

**User onboarding:** Settings page with toggles per source. "Add API key" field. Cost/benefit note per source ("Enables real-time Twitter monitoring — recommended for competitive markets"). Adding a key creates/updates `source_configs`, stores the key in Supabase Vault, next researcher run picks it up automatically.

### Output

- **Structured signals** in `signals` table (system of record)
- **Daily digest** summary for CPO (rendered view of top signals, grouped by project)
- CPO reads digest during standup prep and marks signals as `reviewed`, `investigating`, or `dismissed`

---

## Product Manager — Deep Pipeline

### Trigger

CPO reviews the daily digest, picks a signal worth investigating, and creates a `research` card on the relevant project board. The card references the signal ID and includes CPO's brief.

### Pipeline Stages

The PM runs these stages sequentially within one ephemeral session:

#### 1. Deep Research (parallel, 2-4 reports)

PM dispatches parallel research across available models. Each produces an independent report on the same brief.

| Model | Availability | Notes |
|-------|-------------|-------|
| Claude | Always available | Primary model, always included |
| Gemini | Always available (via gemini-delegate) | 1M context, good for broad landscape |
| Opus | Available if user has Opus access | Deepest reasoning |
| Perplexity | Optional (via OpenRouter, requires API key) | Best for current web data |

More subscriptions = more perspectives = better outcomes. System works with one model, improves with more. Same pluggable pattern as source integrations.

#### 2. Synthesis

Claude (always the primary synthesiser) reconciles all reports into a single synthesis report. Identifies consensus, contradictions, and unique insights each model contributed.

#### 3. Brainstorm with CPO

PM invokes the brainstorming skill *with CPO as the collaborator*. Two agents in conversation:
- PM presents the synthesis report
- CPO stress-tests it against the roadmap, goals, and priorities
- Together they build out concrete feature ideas grounded in the research
- CPO knows what matters strategically — PM brings the external intelligence

Output: a product deep-dive document with feature concepts.

#### 4. Compile Deep-Dive Output

PM structures the brainstorm output into a cohesive document.

#### 5. First Second-Opinion

One pass via Codex or Gemini (whichever is available, preference configurable). Challenges the deep-dive assumptions, flags gaps.

#### 6. Repo-Recon

If the original signal or research identified relevant GitHub repos:
- Run `repo-recon` against each
- Analyze architecture, patterns, tech choices, strengths/weaknesses
- Ground the feature ideas in actual implementation quality — what exists, what's good, what's missing

Skip this step if no relevant repos were identified.

#### 7. Second Second-Opinion

Another pass, focused on: "Given the repo-recon findings, does the feature design hold up? Are we reinventing something that already exists?"

#### 8. Consolidated Findings

PM compiles everything into a single report:
- Executive summary (2-3 sentences)
- Key findings (bulleted)
- Competitive comparison (our approach vs what's out there)
- Repo-recon insights (if applicable)
- Feature concepts from the deep dive
- **Recommendation**: existing feature enhancement (which project, which roadmap phase) OR new project needed
- Suggested card descriptions

#### 9. Review-Plan with CPO

PM presents the consolidated report to CPO using the `review-plan` skill. Two sessions collaborating (tmux with claude-send initially, Agent Teams / Realtime messaging when available).

CPO acts as **bar raiser**:
- Double-checks assumptions
- Challenges weak spots
- Pushes: "How can we do this better?"
- Validates alignment with roadmap and priorities

PM amends the report based on CPO's feedback.

#### 10. Ship

`/ship` — Commit the final report to the project's `docs/plans/` directory.

#### 11. Cardify

`/cardify` — Generate backlog cards from the report. Cards land in Backlog with `cpo-generated` label. Orchestrator picks them up once they reach Up Next via the normal grooming/sprint planning flow.

If the recommendation is `new_project`, CPO triggers `/init` first to bootstrap the project, then `/cardify` for the initial backlog.

### Inter-Agent Communication

Steps 3 and 9 require PM ↔ CPO real-time collaboration.

**Phase 1 (tmux):** Both agents in tmux sessions. PM sends context via `claude-send`. CPO responds. Back-and-forth conversation.

**Phase 2 (Agent Teams / Realtime):** Orchestrator provides a Realtime channel between agents. Structured message passing — PM sends research context, CPO responds with product judgment. Richer than tmux text piping.

---

## Data Model (Supabase)

### `signals`

Market Researcher output. One row per signal discovered.

```sql
create table signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  source_type text not null,        -- github, reddit, twitter, youtube, hackernews, blog
  source_url text,
  title text not null,
  summary text not null,
  relevance_score text not null,    -- high, medium, low
  roadmap_project text,             -- nullable: which project this relates to
  roadmap_phase text,               -- nullable: which phase
  signal_date timestamptz,          -- when the source was published/updated
  status text default 'new',        -- new, reviewed, investigating, actioned, dismissed
  metadata jsonb default '{}'       -- source-specific data (stars, upvotes, etc.)
);
```

### `research_reports`

Product Manager output. One per commissioned investigation.

```sql
create table research_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  signal_id uuid references signals(id),
  brief text not null,                    -- CPO's research brief
  status text default 'in_progress',      -- in_progress, review, shipped, cardified, rejected
  synthesis_report text,
  deep_dive_doc text,
  consolidated_report text,
  recommendation_type text,               -- existing_feature, new_project, no_action
  recommendation_detail jsonb,            -- {project, phase} or {proposed_name, rationale}
  report_path text,                       -- repo path after /ship
  cards_created jsonb default '[]',       -- array of card IDs after /cardify
  cpo_feedback text                       -- bar-raiser feedback from step 9
);
```

### `source_configs`

Pluggable source integrations per team.

```sql
create table source_configs (
  id uuid primary key default gen_random_uuid(),
  source_type text unique not null,   -- github-api, web-search, twitter, reddit, youtube
  enabled boolean default false,
  api_key_ref text,                   -- Supabase Vault reference (never the key itself)
  config jsonb default '{}',          -- source-specific: subreddits, accounts, etc.
  created_at timestamptz default now()
);

-- Default sources (always available)
insert into source_configs (source_type, enabled) values
  ('github-api', true),
  ('web-search', true);
```

### `model_configs`

Available models for deep research, configurable per team.

```sql
create table model_configs (
  id uuid primary key default gen_random_uuid(),
  model_name text unique not null,    -- claude, gemini, opus, perplexity
  enabled boolean default true,
  api_key_ref text,                   -- Supabase Vault (for models needing separate keys)
  provider text not null,             -- anthropic, google, openrouter
  config jsonb default '{}'
);

-- Defaults
insert into model_configs (model_name, enabled, provider) values
  ('claude', true, 'anthropic'),
  ('gemini', true, 'google');
```

---

## Orchestrator Extensions Required

### Gap 1: Cron Job Scheduler (Medium)

**Current:** Orchestrator only knows card-driven jobs (poll task board → dispatch).

**Needed:** A `cron_jobs` table and scheduler loop alongside the existing polling loop.

```sql
create table cron_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,           -- market_researcher (extensible)
  schedule text not null,           -- cron expression: "0 6 * * *"
  enabled boolean default true,
  last_run timestamptz,
  next_run timestamptz,
  config jsonb default '{}'         -- job-specific config
);
```

Orchestrator runs a second loop: check `cron_jobs` where `next_run <= now()` and `enabled = true`, dispatch the job, update `last_run` and `next_run`.

### Gap 2: Inter-Agent Messaging (High — Phase 2)

**Current:** Agents report results to orchestrator. No agent-to-agent communication.

**Needed:** PM ↔ CPO real-time collaboration during pipeline steps 3 and 9.

**Phase 1 stub:** PM and CPO use tmux `claude-send` for back-and-forth. Orchestrator doesn't need to know — the PM agent handles this internally as part of its execution.

**Phase 2:** Orchestrator provides a Supabase Realtime channel per collaboration session. Agents subscribe and exchange structured messages. This generalizes to any agent-to-agent collaboration pattern.

### Gap 3: Source Config Management (Medium)

**Current:** Not in orchestrator design.

**Needed:** `source_configs` table + Supabase Vault for API keys + settings UI (or CLI).

Straightforward CRUD. The researcher reads `source_configs` at the start of each run to determine which source modules to activate.

### Gap 4: Digest Delivery to CPO (Low)

**Current:** CPO reads state files on startup. No push notifications from completed jobs.

**Needed:** CPO includes the daily digest in its standup prep.

**Implementation:** CPO queries `signals` table for signals with `status = 'new'` and `created_at` within the last 24 hours. Same pull pattern as reading state files today — no new infrastructure needed.

---

## Signal Lifecycle

```
                                          ┌──────────────┐
                                          │   dismissed   │
                                          └──────────────┘
                                                ▲
Market Researcher ──▶ [new] ──▶ CPO reviews ──▶ [reviewed] ──┐
                                                              │
                                                              ▼
                                                      [investigating]
                                                              │
                                                     PM runs pipeline
                                                              │
                                              ┌───────────────┤
                                              ▼               ▼
                                        [actioned]      [no_action]
                                     (cards created)   (signal noted,
                                                        no cards)
```

---

## Pluggable Model & Source Strategy

The system improves with more subscriptions. Both sources and models follow the same pattern:

| Layer | Free / Default | Paid / Optional | User Action |
|-------|---------------|-----------------|-------------|
| **Sources** | GitHub API, web search | Twitter API, Reddit API, YouTube API | Add API key in settings |
| **Research models** | Claude, Gemini | Opus, Perplexity (OpenRouter) | Add API key or upgrade plan |

This creates a natural upgrade path: "Your researcher found 3 signals this week. Teams with Twitter monitoring enabled see 2x more relevant signals."

---

## What This Replaces

| Current (manual) | Replaced By |
|---|---|
| Owner manually searches for competitors | Market Researcher daily scan |
| Owner runs deep-research on a hunch | PM deep pipeline, commissioned by CPO |
| Owner runs second-opinion manually | PM pipeline stages 5 + 7 (automated) |
| Owner runs repo-recon manually | PM pipeline stage 6 (automated) |
| Owner decides what to build from research | PM recommends, CPO validates (stages 3, 9) |
| Owner runs /cardify manually | PM triggers /cardify after CPO approval (stage 11) |

---

## Open Questions

1. **Researcher frequency** — Daily is the default. Some teams may want more frequent scans for fast-moving markets. Configurable via `cron_jobs.schedule`, but is there a minimum interval to avoid burning tokens?
2. **Signal retention** — How long do signals stay in the table? Archive after 30 days? Keep forever for trend analysis?
3. **PM concurrency** — Can CPO commission multiple PM investigations in parallel, or one at a time? Parallel is more powerful but uses more slots.
4. **Digest format** — Plain text summary in CPO standup, or a richer format (e.g., a rendered dashboard view)?

---

## Next Steps

1. Owner reviews and approves this design
2. Update the orchestration server design doc to include cron job support and source/model config tables
3. Build Phase 1: Market Researcher agent (daily scan, signals table, digest)
4. Build Phase 2: Product Manager agent (deep pipeline, PM ↔ CPO collaboration via claude-send)
5. Build Phase 3: Inter-agent Realtime messaging (replace claude-send)
6. Build Phase 4: Settings UI for source and model management
