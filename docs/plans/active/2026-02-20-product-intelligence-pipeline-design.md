# Product Intelligence Pipeline — Design Document

**Date:** 2026-02-20
**Status:** revised (post-review, second opinions applied) — partially built, parked
**Authors:** Tom (owner), CPO (agent)
**Pipeline:** idea:c73e2bae
**Focus Area:** Autonomous Organisation
**Review:** `docs/plans/2026-02-20-product-intelligence-pipeline-review.md`

---

## Problem

Execs in a real company don't operate in a vacuum — they have multiple responsibilities, including staying informed about their market. Today, the CPO plans features based on the owner's intuition and whatever context is manually provided. There's no systematic external intelligence: no monitoring of competitors, no awareness of trending discussions in the product's domain, no discovery of relevant open-source repos that could inform or challenge the roadmap.

The owner currently does this manually: commissioning deep-research, running second-opinions, discovering GitHub repos, running repo-recon, synthesizing findings, and deciding what to build. This works but doesn't scale — and it only happens when the owner thinks to do it.

## Solution

Add a **product intelligence pipeline** to zazigv2 — two new ephemeral agent roles that automate market monitoring and research, feeding the CPO's planning work.

1. **Market Researcher** — Scheduled ephemeral agent. Runs daily, scans external sources aligned to active features, surfaces notable signals.
2. **Product Manager** — On-demand ephemeral agent. Commissioned by CPO when a signal warrants deep investigation, or directly by CPO with a manual brief. Runs a multi-stage research pipeline, collaborates with CPO, and produces actionable cards.

Both roles are function-agnostic infrastructure — while the CPO uses them for product intelligence, the same pipeline could serve a CMO (marketing landscape) or CTO (technology radar) with different inputs and review criteria.

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
│  │ (poll jobs table) │        │ (daily researcher)│             │
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

- **Market Researcher** is a standard `job` created by the orchestrator's cron scheduler (`job_type = 'scan'`). The cron scheduler is a shared orchestrator capability — see open question #11 in the orchestration server design.
- **Product Manager** is a standard `job` created by CPO (`job_type = 'research'`). Dispatched like any other job.
- CPO remains the sole persistent agent (Claude Code session with Slack access via MCP).
- PM ↔ CPO collaboration uses Agent Teams (primary) or inbox protocol (fallback). See Inter-Agent Communication section.

### Agent Roles

| Role | Type | Trigger | Lifecycle | Purpose |
|------|------|---------|-----------|---------|
| Market Researcher | Ephemeral job (`scan`) | Cron (daily, configurable) | ~15-30 min per run | Scan external sources, surface signals |
| Product Manager | Ephemeral job (`research`) | CPO creates job (from signal or manual brief) | ~30-60 min per pipeline | Deep research pipeline, collaborate with CPO, produce cards |

### Integration with Existing Data Model

Both roles use the existing `jobs` table from `2026-02-19-zazigv2-data-model.md` as their primary lifecycle tracker. The `signals` table and `research_details` table are domain-specific extensions — they store content and findings, not lifecycle state.

- Researcher daily scan = a `job` with `job_type = 'scan'`, `role = 'researcher'`
- PM investigation = a `job` with `job_type = 'research'`, `role = 'product_manager'`
- Job status (`queued` → `dispatched` → `executing` → `complete`) tracks lifecycle
- `research_details` stores the PM's content artifacts (synthesis, deep-dive, consolidated report)
- `signals` stores the researcher's discovered signals

---

## Market Researcher — Daily Scan

### Schedule

Orchestrator cron scheduler creates a `scan` job daily (configurable, default 06:00 UTC — before CPO's first standup). Uses one ephemeral slot. The cron scheduler is a shared orchestrator capability that also covers nightly done-archiver and bug-scan jobs.

### Input

The researcher reads two things before scanning:

1. **Active features** — Queries the `features` table in Supabase for features with status in (`proposed`, `designing`, `in_progress`). Extracts keywords, domains, competitor names, technology choices from feature specs and project descriptions. This scopes the scan to what the company is actively building and planning — no reliance on markdown roadmap files.
2. **Previous signals** — Queries the `signals` table for prior output. Prevents re-surfacing the same discussion thread or repo.

CPO generates the researcher's prompt each run, embedding current priorities and strategic context that a static config can't capture. The scoring criteria ("what counts as high relevance this week") is part of the prompt, not the schema.

### Scan Flow

1. **Build search queries** from active features — e.g., if a feature spec mentions "version control for writers", search for writing tools, version control UX, competitor launches
2. **GitHub** (API) — Search repos by topic/keywords, filter by recent activity (stars, commits, forks in last 7 days). Flag repos that are new, growing fast, or directly competing
3. **Web sources** (web search + Firecrawl) — Reddit, X, YouTube, Hacker News, relevant blogs. Search for domain keywords, product names, competitor names
4. **Score each signal** — Relevance scoring is embedded in the CPO-generated prompt. Considers: relevance to active features, novelty, urgency (competitor launch vs general discussion)
5. **Deduplicate** against previous signals:
   - **Phase 1**: URL-based dedup (same URL = skip)
   - **Phase 2 (future)**: Semantic dedup via embedding comparison — catches the same topic discussed across Reddit, Hacker News, and blog posts with different URLs
6. **Write signals** to Supabase `signals` table
7. **Generate daily digest** — Top signals grouped by project, stored for CPO standup prep

### Pluggable Source Integrations

Each source is a module. The researcher iterates over enabled source modules from the `source_configs` table.

**Default (no API keys needed):**
- `github-api` — GitHub search API (authenticated via existing GitHub token)
- `web-search` — General web search via deep-research / Firecrawl

**Built (no API key needed):**
- `reddit-scan` — Reddit JSON API scanner. Search by keyword across subreddits or browse top/new/hot posts. Supports time filtering (day/week/month), comment fetching, and compact output for agent consumption. No auth required. Tool: `zazig/tools/reddit-scan`.

**Optional (user adds API key to unlock):**
- `twitter` — Structured Twitter/X feed monitoring. Better signal-to-noise than web search. Perplexity (via OpenRouter) provides good interim Twitter coverage as a research model.
- `youtube` — YouTube Data API for video/channel tracking. Free quota.

**User onboarding:** Settings page with toggles per source. "Add API key" field. Cost/benefit note per source ("Enables real-time Twitter monitoring — recommended for competitive markets"). Adding a key creates/updates `source_configs`, stores the key in Supabase Vault, next researcher run picks it up automatically.

### Output

- **Structured signals** in `signals` table (system of record)
- **Daily digest** summary for CPO (rendered view of top signals, grouped by project)
- CPO reads digest during standup prep and marks signals as `reviewed`, `investigating`, or `dismissed`

---

## Product Manager — Deep Pipeline

### Trigger

Two entry points:

1. **Signal-driven**: CPO reviews the daily digest, picks a signal worth investigating, and creates a `research` job referencing the signal ID with a brief.
2. **Manual**: CPO commissions the PM directly with a brief — no signal required. "Go investigate the competitive landscape for real-time collaboration tools." The `signal_id` on the research details is nullable.

Both create a standard `job` with `job_type = 'research'`, `role = 'product_manager'`. The orchestrator dispatches it like any other job.

### Pipeline Stages

The PM runs these stages sequentially within one ephemeral session (one slot, parallel tool calls within the session — not separate agent dispatches).

**Checkpointing:** The PM writes intermediate artifacts to `research_details` after stages 2, 4, 6, and 8. If the session crashes or the machine goes offline, a restarted PM reads its `research_details` row and resumes from the last completed field. This prevents losing 30-60 minutes of work and duplicating expensive API calls.

#### 1. Deep Research (parallel, 2-4 reports)

PM dispatches parallel research across available models via tool calls. Each produces an independent report on the same brief.

| Model | Availability | Notes |
|-------|-------------|-------|
| Claude | Always available | Primary model, always included |
| Gemini | Always available (via gemini-delegate) | 1M context, good for broad landscape |
| Opus | Available if user has Opus access | Deepest reasoning |
| Perplexity | Optional (via OpenRouter, requires API key) | Best for current web data |

Available models are read from the `research_model_configs` table. More subscriptions = more perspectives = better outcomes. System works with one model, improves with more. Same pluggable pattern as source integrations.

#### 2. Synthesis

Claude (always the primary synthesiser) reconciles all reports into a single synthesis report. Identifies consensus, contradictions, and unique insights each model contributed.

#### 3. Brainstorm with CPO

PM collaborates with CPO via Agent Teams. PM posts the synthesis report, CPO stress-tests it against active features, goals, and priorities. Together they build out concrete feature ideas grounded in the research. CPO knows what matters strategically — PM brings the external intelligence.

Output: a product deep-dive document with feature concepts.

#### 4. Compile Deep-Dive Output

PM structures the brainstorm output into a cohesive document.

#### 5. First Second-Opinion

One pass via Codex or Gemini (whichever is available, preference configurable via `research_model_configs`). Challenges the deep-dive assumptions, flags gaps.

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
- **Recommendation**: existing feature enhancement (which project, which feature) OR new project needed
- Suggested card descriptions

#### 9. Review-Plan with CPO

PM presents the consolidated report to CPO via Agent Teams. CPO acts as **bar raiser**:
- Double-checks assumptions
- Challenges weak spots
- Pushes: "How can we do this better?"
- Validates alignment with active features and priorities

PM amends the report based on CPO's feedback.

#### 10. Ship

`/ship` — Commit the final report to the project's `docs/plans/` directory.

#### 11. Cardify

`/cardify` — Generate features and jobs from the report. In v2, this creates rows in the `features` table (status `proposed`) and optionally pre-creates `jobs` with initial briefs. CPO grooms and promotes features through the normal planning flow. Orchestrator picks up jobs once they reach `queued`.

If the recommendation is `new_project`, CPO triggers `/init` first to bootstrap the project, then `/cardify` for the initial feature set.

### Inter-Agent Communication

Steps 3 and 9 require PM ↔ CPO real-time collaboration.

**Primary: Agent Teams.** Both PM and CPO are Claude Code sessions. They join a team, exchange messages via `SendMessage`, and use the Discussion Pattern (multi-round deliberation) from the Agent Teams learnings doc. PM posts research context, CPO responds with product judgment, back and forth until aligned. Agent Teams is experimental (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) — see `docs/research/2026-02-20-claude-agent-teams-learnings.md`.

**Fallback: Inbox protocol.** If Agent Teams isn't stable enough, use the flat JSON inbox pattern at `~/.local/share/zazig-{instance_id}/inboxes/`. Same schema as the learnings doc. Any agent can write to any other agent's inbox. Agents poll on each cycle.

**Persistent record:** After collaboration completes, PM writes a summary to the `messages` table in Supabase (from the existing data model). This gives the orchestrator, dashboard, and future agents visibility into what was discussed.

---

## Data Model (Supabase)

### Integration with existing schema

The `jobs` table (from `2026-02-19-zazigv2-data-model.md`) is the lifecycle tracker for both researcher and PM work. The tables below are domain-specific extensions that store content, not lifecycle state.

### `signals`

Market Researcher output. One row per signal discovered.

```sql
create table signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  created_at timestamptz default now(),
  source_type text not null,        -- github, reddit, twitter, youtube, hackernews, blog
  source_url text,                   -- normalized: strip query params, anchors, trailing slashes
  title text not null,
  summary text not null,
  relevance_score text not null,    -- high, medium, low
  project_id uuid references projects(id),  -- nullable: which project this relates to
  feature_id uuid references features(id),  -- nullable: which feature this relates to
  signal_date timestamptz,          -- when the source was published/updated
  status text default 'new',        -- new, reviewed, investigating, actioned, dismissed
  metadata jsonb default '{}'       -- source-specific data (stars, upvotes, etc.)
);

-- Prevent duplicate signals from the same URL within a company
-- Researcher normalizes URLs before writing (strip utm params, anchors, trailing slashes)
create unique index signals_company_url on signals (company_id, source_url) where source_url is not null;
```

### `research_details`

PM pipeline content artifacts. Extension table linked to a `job` via `job_id`. Does NOT track lifecycle — the parent `job` handles status transitions.

```sql
create table research_details (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  job_id uuid not null references jobs(id),      -- the PM's research job
  signal_id uuid references signals(id),          -- NULLABLE: null for manual CPO-commissioned research
  brief text not null,                             -- CPO's research brief
  synthesis_report text,
  deep_dive_doc text,
  consolidated_report text,
  recommendation_type text,                        -- existing_feature, new_project, no_action
  recommendation_detail jsonb,                     -- {project, feature} or {proposed_name, rationale}
  report_path text,                                -- repo path after /ship
  cards_created jsonb default '[]',                -- array of card/feature IDs after /cardify
  cpo_feedback text                                -- bar-raiser feedback from step 9
);
```

### `source_configs`

Pluggable source integrations, company-scoped.

```sql
create table source_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  source_type text not null,        -- github-api, web-search, twitter, reddit, youtube
  enabled boolean default false,
  api_key_ref text,                 -- Supabase Vault reference (never the key itself)
  config jsonb default '{}',        -- source-specific: subreddits, accounts, etc.
  created_at timestamptz default now(),
  unique (company_id, source_type)
);

-- Default sources (created per company on onboarding)
-- github-api: enabled by default
-- web-search: enabled by default
```

### `research_model_configs`

Available models for deep research (PM pipeline stage 1), company-scoped. Distinct from the orchestrator's execution model routing (complexity → model tier for code/infra jobs).

```sql
create table research_model_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  model_name text not null,         -- claude, gemini, opus, perplexity
  enabled boolean default true,
  api_key_ref text,                 -- Supabase Vault (for models needing separate keys)
  provider text not null,           -- anthropic, google, openrouter
  config jsonb default '{}',
  unique (company_id, model_name)
);

-- Defaults (created per company on onboarding)
-- claude: enabled, provider anthropic
-- gemini: enabled, provider google
```

---

## Orchestrator Dependencies

This pipeline depends on orchestrator capabilities that are either planned or need speccing. Rather than redefining them here, we reference the orchestrator design.

### Cron Scheduler (open question #11 in orchestration server design)

The market researcher needs a cron trigger. This is a shared orchestrator capability — the same scheduler covers nightly done-archiver, bug-scan, and any future scheduled jobs. The orchestrator creates a standard `job` on schedule; the local agent executes it like any other job.

**Key behaviour for this pipeline:** If no machine is online at trigger time, the scan job sits in `queued` until one connects. No scan is lost, just delayed.

### Heartbeat Depth (open question #12 in orchestration server design)

The PM pipeline runs for 30-60 minutes across multiple stages. If the PM's session gets stuck mid-pipeline, the orchestrator needs to detect it and restart. This requires per-job health metrics in local agent heartbeats (last activity timestamp, stuck detection), not just machine-level "alive." Leaning toward split model: cloud schedules and monitors, local agent reports rich health data.

### Inter-Agent Messaging

The `messages` table in the existing data model handles persistent records. Real-time PM ↔ CPO collaboration uses Agent Teams (or inbox protocol fallback). No new orchestrator infrastructure needed — Agent Teams is a Claude Code feature, and the inbox protocol is flat JSON files.

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

CPO can also create a `research` job directly (manual trigger) — this bypasses the signal lifecycle entirely.

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

1. **Researcher frequency** — Daily is the default. Some teams may want more frequent scans for fast-moving markets. Configurable via cron schedule, but is there a minimum interval to avoid burning tokens?
2. **Signal retention** — How long do signals stay in the table? Archive dismissed signals after 30 days? Keep actioned signals forever for trend analysis?
3. **PM concurrency** — Can CPO commission multiple PM investigations in parallel, or one at a time? Parallel is more powerful but uses more slots.
4. **PM cost controls** — The deep pipeline is expensive (2-4 deep-research calls, multiple second opinions, repo-recon). Should there be a per-company budget cap on PM investigations per month? Or trust CPO's judgment?
5. **Researcher prompt evolution** — CPO generates the prompt each run. How does it improve over time? Feedback loop from dismissed signals? Manual tuning?

---

## Implementation Status

### Build Strategy

Build as Claude Code skills first, migrate to orchestrator-dispatched jobs later. The pipeline logic is the same — only the trigger and state storage change.

### Tooling — Built

| Tool | Location | Status | Notes |
|------|----------|--------|-------|
| `deep-research` | `~/.local/bin/deep-research` | Done | Multi-provider: `--provider gemini` or `--provider openai`. OpenAI deep research built but **awaiting identity verification** to use. Gemini Deep Research works now. |
| `x-scan` | Claude Code skill | Done | Basic X/Twitter API access. Last 30 days search with full X and YouTube search. |
| `reddit-scan` | `zazig/tools/reddit-scan` → `~/.local/bin/` | Done | Reddit JSON API. Search by keyword, browse subreddits, filter by time period. `--comments` for sentiment, `--compact` for agent consumption. No auth needed. |
| `gemini-delegate` | `~/.local/bin/gemini-delegate` | Done | Gemini analysis/Q&A with optional file context. |
| `codex-delegate` | `zazig/tools/codex-delegate` → `~/.local/bin/` | Done | OpenAI Codex delegation (implement or investigate mode). |
| `second-opinion` | Claude Code skill | Done | Sends recommendation to Codex or Gemini for independent review. |
| `repo-recon` | Claude Code skill | Done | GitHub repo architecture analysis. |
| `/brainstorming` | Claude Code skill | Done | Interactive design brainstorming (PM uses with CPO at stage 3). |
| `/review-plan` | Claude Code skill | Done | Interactive plan review with one-way door analysis (PM uses with CPO at stage 9). |
| `/cardify` | Claude Code skill | Done | Design doc → features/jobs (currently targets Trello, needs v2 adapter). |
| `/ship` | Claude Code skill | Done | Commit, push, PR, merge. |

### Skill → Role Mapping

Each pipeline role uses a specific set of skills. The pipeline is not one monolithic skill — it's a choreography of existing skills, each invoked by the role that owns that stage.

**Market Researcher** (daily scan agent):

| Stage | Skill / Tool | What it does |
|-------|-------------|--------------|
| Scan X/Twitter | `x-scan` | Last 30 days of activity in target domains |
| Scan Reddit | `reddit-scan` | Subreddit keyword search + top posts |
| Scan GitHub | GitHub API (direct) | Repo search by topic, stars, recent activity |
| Scan web | `deep-research --provider gemini` | Broad web search for competitor launches, blog posts |
| Output | Write to `signals` table | Structured signals with scores, grouped by project |

Needs building: **`/market-research` skill** — orchestrates the above into a single scan run. Reads active features for keywords, runs all source scans, deduplicates, writes signals, generates daily digest.

**Product Manager** (deep pipeline, commissioned by CPO):

| Stage | Skill / Tool | What it does |
|-------|-------------|--------------|
| 1. Deep Research | `deep-research` (parallel, multiple `--provider`) | 2-4 independent research reports |
| 2. Synthesis | Claude (native) | Reconcile reports into single synthesis |
| 3. Brainstorm | `/brainstorming` (with CPO via Agent Teams) | Stress-test synthesis, build feature concepts |
| 4. Compile | Claude (native) | Structure brainstorm into deep-dive doc |
| 5. First Second-Opinion | `/second-opinion` | Challenge assumptions via Codex or Gemini |
| 6. Repo-Recon | `/repo-recon` | Analyze relevant GitHub repos |
| 7. Second Second-Opinion | `/second-opinion` | Validate against repo-recon findings |
| 8. Consolidated | Claude (native) | Compile everything into final report |
| 9. Review-Plan | `/review-plan` (with CPO via Agent Teams) | CPO bar-raiser review |
| 10. Ship | `/ship` | Commit report to `docs/plans/` |
| 11. Cardify | `/cardify` | Generate features + jobs from report |

Needs building: **`/product-investigation` skill** — orchestrates the 11 stages above. Accepts a brief (from signal or manual), runs the full pipeline with CPO collaboration at stages 3 and 9, checkpoints to `research_details` at stages 2, 4, 6, 8.

**CPO** (persistent, coordinates both):

| Action | Skill / Tool | When |
|--------|-------------|------|
| Generate researcher prompt | Claude (native) | Before each `/market-research` run |
| Review daily digest | Read `signals` table | At standup |
| Commission PM | Create `research` job with brief | When a signal warrants investigation |
| Collaborate with PM | Agent Teams (stages 3, 9) | During `/product-investigation` |
| Groom output | `/cardify` output review | After PM pipeline completes |

### Tooling — Not Yet Built

| Skill | Role | Purpose | Blocker |
|-------|------|---------|---------|
| `/market-research` | Market Researcher | Full daily scan: X + Reddit + GitHub + web → signals table → daily digest | Next to build |
| `/product-investigation` | Product Manager | Full 11-stage deep pipeline with CPO collaboration | After `/market-research` |
| Perplexity integration | PM (stage 1) | Add as `--provider perplexity` to `deep-research` | Need OpenRouter API key or direct Perplexity API |
| OpenAI deep research | PM (stage 1) | `deep-research --provider openai` | Awaiting identity verification |

### Review History

- **Review**: `docs/plans/2026-02-20-product-intelligence-pipeline-review.md` (CPO agent)
- **Second opinions**: Codex (gpt-5.3-codex) + Gemini (gemini-3.1-pro-preview) — both run 2026-02-20
- **Fixes applied from second opinions**: feature status enum alignment, PM checkpointing, `/cardify` v2 language, URL dedup constraint, `scan` job type added to data model CHECK, `researcher` + `product_manager` roles bootstrapped

---

## Next Steps

1. ~~Build `deep-research` multi-provider support~~ — Done (Gemini works; OpenAI awaiting identity verification)
2. ~~Build `reddit-scan` tool~~ — Done
3. ~~Build `x-scan` skill~~ — Done (basic API access, last 30 days)
4. ~~Resolve CPO runtime question with Chris~~ — Resolved 2026-02-20: CPO is Claude Code with Slack MCP (not Agent SDK). Runs locally, accessible via Slack. Full skills toolchain preserved.
5. **Build `/market-research` skill** — Market Researcher role. Orchestrates: x-scan + reddit-scan + GitHub API + deep-research → signals → daily digest
6. **Build `/product-investigation` skill** — Product Manager role. Orchestrates the 11-stage deep pipeline with CPO collaboration via Agent Teams
7. Complete OpenAI identity verification — unblocks `deep-research --provider openai`
8. Add Perplexity as research provider — OpenRouter API key or direct API
9. Spec cron scheduler in orchestrator design (shared capability, open question #11)
10. Migrate skills to orchestrator-dispatched jobs when zazigv2 infra is ready
11. Build Settings UI for source and model management
