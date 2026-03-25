# Autonomous Workers: X Scout & Staging Patrol

## Context

The zazig pipeline is deterministic and card-driven: ideas flow through triage → spec → breakdown → build → review → ship. Every agent is dispatched by the orchestrator in response to a state change. Nothing happens unless a card exists.

This leaves an entire class of valuable work unaddressed — continuous, proactive tasks that nobody files a card for:
- Scanning external sources for product intelligence
- Exercising staging to catch regressions before anyone notices
- Monitoring dependencies, competitors, community sentiment

The Athena project (`../athena`) ships a proven architecture for exactly this: autonomous agents running on heartbeat loops, each an isolated OS process managed by a Go supervisor. The Patron desktop app provides start/stop control and visibility.

This design doc proposes an experiment: **two autonomous workers**, built in Go, independent from local-agent, reading/writing to the existing Supabase backend. A lightweight Electron app provides management UI.

**Key decisions:**
- **Separate repo** (`zazig-workers`) — different language (Go), different build chain, independent lifecycle. The only shared surface is Supabase via HTTP. If the experiment fails, archive one repo.
- **X API access** — already available, no additional API tier cost.
- **Browser automation** — Vercel's `agent-browser` (Rust CLI + Playwright daemon) called from Go via subprocess. Ref-based accessibility snapshots are token-efficient (~200-400 tokens/page). Drives Electron apps natively via CDP.

## Goals

1. Validate that heartbeat-driven autonomous workers add value outside the pipeline
2. Prove the Go supervisor + worker process model works alongside the existing Node local-agent
3. Establish a reusable framework so adding worker #3, #4, ... is just config + an OBSERVE implementation
4. Keep it cheap — Haiku for evaluation, Sonnet for composition, hard budget caps

## Non-Goals

- Replacing any pipeline functionality
- Full org-model prompt stack assembly (workers get a simple system prompt, not the 6-layer stack)
- Production polish on the Electron app (internal tool, rough is fine)
- Multi-tenant support (single-company experiment)

## Architecture

### Process Model (forked from Athena)

```
zazig-workers (Electron app)
  │
  └── zazig-supervisor (Go binary, forked from athena-supervisor)
        │  HTTP API on :9091
        │  Process lifecycle: spawn, monitor, restart with backoff
        │
        ├── x-scout (Go binary)
        │     Own process, own state, own config
        │     Tick: every 2h
        │
        └── staging-patrol (Go binary)
              Own process, own state, own config
              Tick: every 3h
```

Each component is a separate OS process. The supervisor manages child process lifecycle (start, stop, crash recovery with exponential backoff capped at 5min). The Electron app spawns the supervisor and communicates via its HTTP API.

**Why not bolt onto local-agent:**
- Process isolation — a runaway worker can't starve pipeline slots
- Independent restart — crash one worker, the others don't notice
- Independent deployment — ship a new worker binary without touching local-agent
- Language fit — Go is better for long-running daemons with timers and HTTP servers
- Clean separation of concerns — pipeline work is bursty and high-priority; autonomous work is steady-state and low-priority

### Worker Lifecycle (OBSERVE → EVALUATE → DECIDE → ACT → REFLECT)

Every worker runs the same 5-step loop on each heartbeat tick, adapted from Athena's autonomy loop:

```
┌─────────┐
│ OBSERVE │  Poll external source(s), fetch raw data
└────┬────┘
     │
┌────▼─────┐
│ EVALUATE │  Score/classify findings for relevance (Haiku — cheap)
└────┬─────┘
     │
┌────▼────┐
│ DECIDE  │  Threshold-based action selection (deterministic, no LLM)
└────┬────┘
     │
┌────▼───┐
│  ACT   │  Compose output + self-review gate (Sonnet)
└────┬───┘
     │
┌────▼─────┐
│ REFLECT  │  Log learnings, update internal state (Sonnet)
└──────────┘
```

Each step is a pluggable function. Adding a new worker type means implementing OBSERVE and customising ACT — the rest of the loop is shared.

### Supabase Integration

Workers read from and write to the existing Supabase instance. They do NOT go through the orchestrator — they interact with the DB directly via the PostgREST API using a service role key.

**New table: `worker_reports`**

```sql
CREATE TABLE worker_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  worker_type TEXT NOT NULL,          -- 'x-scout', 'staging-patrol'
  tick_number INTEGER NOT NULL,
  report_type TEXT NOT NULL,          -- 'digest', 'alert', 'bug', 'fix'
  title TEXT NOT NULL,
  body TEXT NOT NULL,                 -- markdown
  metadata JSONB DEFAULT '{}',        -- worker-specific structured data
  severity TEXT DEFAULT 'info',       -- 'info', 'warning', 'critical'
  acknowledged BOOLEAN DEFAULT FALSE, -- CPO/CTO has seen it
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_worker_reports_type ON worker_reports(worker_type, created_at DESC);
CREATE INDEX idx_worker_reports_unacked ON worker_reports(acknowledged) WHERE NOT acknowledged;
```

**Writing bug cards:** Staging Patrol can insert directly into the `ideas` table with `source = 'monitoring'`, which enters the normal triage pipeline. For trivial fixes, it pushes a branch and inserts into `features` with status `created`.

**Reading state:** Workers query `features`, `jobs`, `projects` as needed (e.g., Staging Patrol reads the current staging deployment URL from `projects.metadata`).

**Auth:** Service role key, loaded from Doppler (`zazig` project, `prd` config) or env var. No RLS — workers are trusted internal processes.

### Go Module Structure

```
zazig-workers/
├── cmd/
│   ├── supervisor/          # Supervisor binary (forked from athena)
│   │   └── main.go
│   ├── x-scout/             # X Scout worker binary
│   │   └── main.go
│   └── staging-patrol/      # Staging Patrol worker binary
│       └── main.go
├── internal/
│   ├── supervisor/          # Process manager (forked from athena)
│   │   └── manager.go
│   ├── autonomy/            # Shared loop engine (forked from athena)
│   │   ├── scheduler.go     # Heartbeat + tick timing
│   │   ├── loop.go          # OBSERVE→EVALUATE→DECIDE→ACT→REFLECT orchestration
│   │   ├── decide.go        # Threshold-based decision logic
│   │   └── reflect.go       # Post-tick reflection
│   ├── provider/            # LLM abstraction (forked from athena)
│   │   ├── provider.go      # Interface + registry
│   │   └── anthropic.go     # Anthropic implementation
│   ├── platform/            # Supabase client
│   │   ├── supabase.go      # PostgREST + Realtime client
│   │   └── types.go         # Report, idea, feature structs
│   ├── state/               # Worker state persistence (forked from athena)
│   │   └── state.go         # state.json + decisions.jsonl + memory.jsonl
│   └── browser/             # Browser automation (staging-patrol only)
│       └── browser.go       # agent-browser CLI wrapper
├── configs/
│   ├── x-scout.toml
│   └── staging-patrol.toml
├── data/
│   ├── x-scout/             # Runtime state directory
│   │   ├── state.json
│   │   ├── decisions.jsonl
│   │   └── memory.jsonl
│   └── staging-patrol/
│       ├── state.json
│       ├── decisions.jsonl
│       └── memory.jsonl
├── go.mod
├── go.sum
├── Makefile
└── app/                     # Electron management app
    ├── package.json
    ├── src/
    │   ├── main/
    │   │   ├── index.ts      # Electron main process
    │   │   └── supervisor.ts # Spawn/manage supervisor binary
    │   └── renderer/
    │       ├── App.tsx
    │       ├── WorkerCard.tsx # Per-worker status + controls
    │       └── ReportFeed.tsx # Recent reports stream
    ├── electron-vite.config.ts
    └── tailwind.config.ts
```

## Worker 1: X Scout

### Purpose

Continuously scan X/Twitter for product-relevant signals: competitor activity, market trends, user pain points, emerging tools, and opportunities. Produces periodic digests and real-time alerts for high-signal findings.

### OBSERVE

Poll the X API v2 (via `gotwi` library) for:
- **Keyword searches:** Configurable list of terms (product name, competitor names, technology keywords, pain-point phrases)
- **Account monitoring:** Configurable list of accounts to watch (competitors, thought leaders, relevant communities)
- **Hashtag tracking:** Relevant hashtags for the product space

X API access is already available (existing account). Rate limits and query breadth will be tuned based on the tier's allowances.

### EVALUATE

Send batch of tweets to Haiku with the worker's system prompt:

```
You are an X/Twitter intelligence analyst for [product description].
Score each tweet 0-100 for relevance to product strategy, competitive
intelligence, market signals, or technology trends.
Respond with JSON: [{tweet_id, score, category, rationale}]
Categories: competitor, market_signal, user_pain_point, technology, opportunity, noise
```

### DECIDE (deterministic)

- Score >= 80: `ActionAlert` — immediate high-signal finding
- Score >= 50: `ActionDigest` — include in periodic digest
- Score >= 20: `ActionLog` — record for pattern tracking
- Score < 20: `ActionSkip`

At end of tick, if any `ActionDigest` items accumulated: compose digest.

### ACT

**For alerts (score >= 80):**
- Compose a 2-3 sentence summary via Sonnet with the source tweet context
- Self-review gate: Is this genuinely actionable? Would CPO/CTO want to see this immediately?
- If approved: Insert into `worker_reports` with `severity = 'critical'` and `report_type = 'alert'`

**For digests (end of tick):**
- Batch all `ActionDigest` items
- Compose a structured digest via Sonnet: themes, notable tweets, emerging patterns
- Insert into `worker_reports` with `report_type = 'digest'`

### REFLECT

Brief Sonnet call: "Given what you found this tick, should any search terms be added/removed? Any emerging patterns worth tracking?" Logged to `memory.jsonl` for cross-tick pattern recognition.

### Config (`x-scout.toml`)

```toml
[worker]
name = "x-scout"
type = "x-scout"
company_id = "..."

[models]
evaluate = "anthropic/claude-haiku-4-5-20251001"
compose = "anthropic/claude-sonnet-4-5"
reflect = "anthropic/claude-sonnet-4-5"

[provider.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[provider.x]
bearer_token_env = "X_BEARER_TOKEN"

[supabase]
url_env = "SUPABASE_URL"
service_key_env = "SUPABASE_SERVICE_ROLE_KEY"

[heartbeat]
interval_seconds = 7200  # 2 hours

[autonomy]
assertiveness = 60       # moderate — don't over-alert
alert_threshold = 80
digest_threshold = 50
max_tweets_per_tick = 250

[observe]
keywords = ["zazig", "ai agents", "autonomous coding", "ai dev tools", "cursor", "windsurf", "codex", "claude code"]
accounts = ["@competitor1", "@competitor2"]
hashtags = ["#aidev", "#autonomousagents"]
```

## Worker 2: Staging Patrol

### Purpose

Periodically exercise the staging environment as a user would — hit endpoints, navigate flows, check for regressions, validate recent deployments. Files bug cards for real issues, directly fixes trivial problems, and builds a baseline of "known good" behavior over time.

### OBSERVE

Two-phase observation:

**Phase 1 — API-level checks (always runs):**
- Hit all Supabase edge function endpoints with known-good payloads
- Verify response codes, response shapes, timing
- Check database consistency (orphaned jobs, stuck features, stale machines)
- Validate Realtime websocket connectivity

**Phase 2 — Browser-level flows (graduates to this):**
- Use Vercel's `agent-browser` CLI for both deterministic and exploratory flows
- Exercise key user journeys: login → dashboard → create idea → watch pipeline → view result
- Screenshot on failure for debugging context

**Browser tooling: `agent-browser`**

Vercel's `agent-browser` is a Rust CLI that drives Chrome via a Playwright daemon. Go calls it via subprocess with `--json` for structured output. The daemon stays warm between calls (sub-100ms per operation).

Key capabilities:
- **Ref-based snapshots:** `agent-browser snapshot -i` returns an accessibility tree with refs (`@e1`, `@e2`). ~200-400 tokens per page — extremely LLM-efficient for EVALUATE step.
- **Deterministic interaction:** `agent-browser click @e2`, `agent-browser fill @e3 "text"`, `agent-browser press Enter`
- **Batch mode:** Pipe a JSON array of commands to `agent-browser batch --json` for multi-step flows in a single subprocess call
- **Screenshots:** `agent-browser screenshot --annotate` produces numbered-element overlays for debugging
- **Electron support:** First-class CDP connection to Electron apps via `agent-browser connect <port>` — relevant if patrolling the webui
- **No cloud dependency:** Runs local Chrome, self-hosted

Integration pattern from Go:
```go
func snapshot(ctx context.Context) (string, error) {
    cmd := exec.CommandContext(ctx, "agent-browser", "snapshot", "-i", "--json")
    out, err := cmd.Output()
    return string(out), err
}
```

The worker's OBSERVE step calls `agent-browser open <staging-url>` then `snapshot -i` to get the accessibility tree. Findings (missing elements, error states, broken layouts) are passed to EVALUATE as structured refs rather than raw HTML.

### EVALUATE

Send observation results to Haiku:

```
You are a QA engineer reviewing staging environment health.
Classify each finding:
- regression: worked before, broken now (compare against baseline)
- flaky: intermittent failure, seen before
- config: environment/config issue, not code bug
- real_bug: new defect in application logic
- degradation: performance regression (>2x baseline latency)
- healthy: expected behavior
Respond with JSON: [{finding_id, classification, confidence, reasoning}]
```

### DECIDE (deterministic)

- `regression` or `real_bug` with confidence >= 0.8: `ActionFileBug`
- `regression` or `real_bug` with confidence < 0.8: `ActionInvestigate` (re-run next tick with more detail)
- `degradation`: `ActionFileBug` if sustained across 2+ ticks
- `config`: `ActionAlert` to CTO
- `flaky`: `ActionLog` (track frequency, escalate if > 3 occurrences)
- `healthy`: `ActionUpdateBaseline`

### ACT

**For `ActionFileBug`:**
- Compose bug report via Sonnet: steps to reproduce, expected vs actual, severity assessment
- Self-review gate: Is this a real bug or test environment noise?
- If approved: Insert into `ideas` table with `source = 'monitoring'`, `domain = 'engineering'`
- This enters the normal triage pipeline — CPO/triage-analyst picks it up

**For trivial fixes** (e.g., 500 from a missing env var, broken link, obvious typo):
- Compose fix description via Sonnet
- Insert into `worker_reports` with `report_type = 'fix'` and `severity = 'info'`
- Do NOT auto-push code in the experiment phase — just report what could be fixed and how

**For `ActionUpdateBaseline`:**
- Update local baseline file (`data/staging-patrol/baseline.json`) with current response times, shapes, checksums
- No LLM call needed — deterministic

### REFLECT

Brief Sonnet call: "Summarise staging health this tick. Any patterns emerging across recent ticks? Any tests that should be added to the baseline?" Logged to `memory.jsonl`.

### Config (`staging-patrol.toml`)

```toml
[worker]
name = "staging-patrol"
type = "staging-patrol"
company_id = "..."

[models]
evaluate = "anthropic/claude-haiku-4-5-20251001"
compose = "anthropic/claude-sonnet-4-5"
reflect = "anthropic/claude-sonnet-4-5"

[provider.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[supabase]
url_env = "SUPABASE_URL"
service_key_env = "SUPABASE_SERVICE_ROLE_KEY"

[heartbeat]
interval_seconds = 10800  # 3 hours

[autonomy]
assertiveness = 70        # fairly aggressive bug filing
bug_confidence_threshold = 0.8
flaky_escalation_count = 3
max_findings_per_tick = 20

[observe]
staging_url = "https://staging.zazig.app"
edge_function_base = "https://jmussmwglgbwncgygzbz.supabase.co/functions/v1"
endpoints = [
  "orchestrator",
  "agent-event",
  "agent-inbound-poll",
  "request-feature-fix",
]
browser_enabled = false    # start API-only, enable later
browser_flows = [
  "login_and_dashboard",
  "create_idea_flow",
  "pipeline_monitoring",
]
```

## Electron App

### Scope

Minimal internal management UI. Not a product — a control panel.

### Features

1. **Worker list** — Card per worker showing: name, status (running/stopped/crashed), last tick time, tick count, current tick phase
2. **Start/Stop toggles** — Per-worker, calls supervisor HTTP API
3. **Report feed** — Scrollable list of recent `worker_reports`, newest first, filterable by worker and severity
4. **Worker detail** — Click into a worker to see: config summary, recent decisions log, memory excerpts, cost estimate
5. **Install workers** — Download/build Go binaries, write initial config files. Also available via CLI (`zazig-workers install`)

### Tech Stack

- Electron 33 + React 19 + Tailwind 4 (same as Patron)
- electron-vite for builds
- Go binaries bundled as `extraResources` (same pattern as Patron)
- Supabase JS client for reading `worker_reports` in the renderer

### Supervisor HTTP API

```
GET  /api/v1/workers           → [{name, type, status, pid, lastTick, tickCount, restartCount}]
POST /api/v1/workers/:name/start  → 200 OK
POST /api/v1/workers/:name/stop   → 200 OK
GET  /api/v1/workers/:name/status → {name, type, status, pid, lastTick, ...config summary}
```

### CLI Alternative

```bash
# Install workers (downloads binaries, writes default configs)
zazig-workers install

# Start supervisor + all workers
zazig-workers start

# Start specific worker
zazig-workers start x-scout

# Stop specific worker
zazig-workers stop staging-patrol

# Show status
zazig-workers status

# Tail reports
zazig-workers reports --follow
```

## Forking Strategy (from Athena)

### Fork directly (minimal changes)

| Athena Source | Target | Changes |
|---|---|---|
| `supervisor/manager/manager.go` | `internal/supervisor/manager.go` | Rename Scholar→Worker, remove paper-specific fields |
| `scholar/autonomy/scheduler.go` | `internal/autonomy/scheduler.go` | Remove mention polling (workers don't have mentions) |
| `scholar/autonomy/decide.go` | `internal/autonomy/decide.go` | Replace forum actions with worker actions (Alert, Digest, FileBug, etc.) |
| `scholar/provider/provider.go` | `internal/provider/provider.go` | As-is |
| `scholar/provider/anthropic.go` | `internal/provider/anthropic.go` | As-is |
| `scholar/config/config.go` | `internal/config/config.go` | Replace ScholarConfig→WorkerConfig, AgoraConfig→SupabaseConfig |
| `scholar/state/state.go` | `internal/state/state.go` | Replace Gaps→Findings, SeenThreads→SeenItems |

### Rewrite (new implementations)

| Component | Why |
|---|---|
| `cmd/x-scout/main.go` | OBSERVE implementation specific to X API |
| `cmd/staging-patrol/main.go` | OBSERVE implementation specific to staging checks |
| `internal/platform/supabase.go` | Different schema (worker_reports, ideas, features vs Agora threads) |
| `internal/browser/browser.go` | New — `agent-browser` CLI wrapper for Staging Patrol |
| `app/*` | New Electron app (can reference Patron's structure) |

### Not needed (Athena-specific, skip entirely)

- `scholar/platform/backend.go` (Agora-specific interface)
- `scholar/autonomy/act.go` (forum posting logic)
- `patron/src/main/adopt.ts` (paper adoption)
- All paper/credibility/voting logic

## Cost Estimate

### Per month, both workers running

| Component | Cost |
|---|---|
| X API | $0 (existing access) |
| Haiku (evaluate): ~24 calls/day × 2 workers × 1K tokens × 30 days | ~$3 |
| Sonnet (compose + reflect): ~24 calls/day × 2 workers × 2K tokens × 30 days | ~$30 |
| Total | ~$33/month |

Haiku evaluation keeps the cost floor low. X API is already covered.

### Budget caps

Each worker config includes `daily_budget_usd`. The autonomy loop tracks token usage per tick and skips the ACT step if budget is exhausted. Start with $5/day per worker for LLM costs.

## Build Sequence

### Phase 1 — Framework (Week 1)

1. Init Go module `zazig-workers`
2. Fork supervisor, scheduler, provider, state, config from Athena
3. Adapt types (Worker replaces Scholar, findings replace threads)
4. Build supervisor binary, verify it starts/stops dummy workers
5. Supabase migration: `worker_reports` table
6. Basic Supabase Go client (PostgREST reads/writes via `supabase-community/supabase-go`)

### Phase 2 — X Scout (Week 2)

1. Implement X API OBSERVE (gotwi + configured searches)
2. Wire EVALUATE → DECIDE → ACT → REFLECT with Anthropic provider
3. Verify end-to-end: tick fires → tweets fetched → scored → digest written to `worker_reports`
4. Add self-review gate on alerts
5. Config tuning (keywords, thresholds, tick interval)

### Phase 3 — Staging Patrol (Week 2-3)

1. Implement API-level OBSERVE (hit edge functions, check responses)
2. Add baseline tracking (known-good response shapes/times)
3. Wire EVALUATE → DECIDE → ACT for bug filing to `ideas` table
4. Add `agent-browser` integration (Phase 2 OBSERVE, behind `browser_enabled` flag)
5. Config tuning (endpoints, thresholds, baseline sensitivity)

### Phase 4 — Electron App (Week 3)

1. Scaffold Electron app (electron-vite + React + Tailwind)
2. Supervisor spawn/management (fork Patron's `supervisor.ts`)
3. Worker list view with start/stop controls
4. Report feed view (query `worker_reports` via Supabase JS)
5. CLI install command (build binaries + write default configs)
6. Package with electron-builder (bundle Go binaries as extraResources)

## Success Criteria

After 2 weeks of both workers running:

1. **X Scout** has produced at least 5 digests that CPO found genuinely useful (not noise)
2. **Staging Patrol** has caught at least 1 real regression before a human noticed
3. **Framework** is stable — no supervisor crashes, workers recover from failures cleanly
4. **Cost** stayed under $50/month total (LLM only, X API already covered)
5. **Adding worker #3** would require only: new `cmd/` binary + OBSERVE implementation + TOML config — no framework changes

## Future Workers (if experiment succeeds)

The 10 roles from the initial brainstorm, in priority order:

1. **Dependency Watchdog** — npm audit, security advisories, major version alerts → CTO
2. **Community Pulse Monitor** — Reddit, HN, Discord scanning → CPO
3. **Competitor Intelligence Analyst** — changelog/pricing/hiring monitoring → CPO + CTO
4. **Open Source Scout** — GitHub trending, relevant new tools → CTO
5. **Content & Growth Strategist** — draft announcements for shipped features → CPO
6. **User Feedback Synthesizer** — aggregate reviews/mentions into themes → CPO
7. **Documentation Gardener** — detect stale docs, broken links → file cards
8. **Performance Sentinel** — Supabase metrics, cold start times → CTO
9. **Regulation & Compliance Watcher** — policy changes, AI legislation → CPO + CTO
10. **Talent Scout** — GitHub contributors, community members → hiring pipeline
