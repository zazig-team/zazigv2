# Recon: Mission Control (builderz-labs)
*Analyzed: 2026-03-01 | Commit: e77ec4cf | Compared against: zazigv2*

## TL;DR

- Open-source AI agent orchestration dashboard — 26 panels, Next.js 16, React 19, SQLite (WAL), Zustand, Tailwind. MIT license.
- Zero external dependencies (no Redis/Postgres/Docker). Single `pnpm start` to run. Impressive for what it delivers.
- Best patterns to steal: **provisioning governance workflow**, **event bus decoupling**, **webhook HMAC delivery**, **quality review gates**, **smart polling hook**.
- We are definitively stronger on: database (Postgres/RLS), pipeline decomposition, agent autonomy, multi-machine dispatch.
- Their operational discipline around privileged operations and quality gates is worth studying — simpler doesn't mean worse for control-plane safety.

## Steal List

Ranked by impact for zazigv2. Codex re-prioritized from my original ordering — I agree with the adjustment.

### 1. Provisioning Governance Workflow (HIGH)
**What:** Full tenant provisioning lifecycle with approval gates, dry-run mode, two-person rule, kill-switch, and audit trail. Privileged Unix socket daemon with strict command allowlisting — every shell command validated against patterns before execution.

**Where:** `src/lib/super-admin.ts`, `ops/mc-provisioner-daemon.js`, `src/app/api/super/provision-jobs/[id]/route.ts`

**Why it matters:** We're building multi-tenant provisioning. Their governance model (queued → approved → running → completed/failed, with dry-run and rejection) is battle-tested for this. The daemon's command allowlisting pattern is especially relevant — they validate every `useradd`, `install`, `cp`, `chown`, `systemctl` call against strict argument patterns before execution.

**Borrowing plan:** Adapt the approval-gate + dry-run pattern for our provisioning flow. Consider command allowlisting for any future privileged operations.

### 2. EventBus → SSE/Webhook Fan-out (HIGH)
**What:** Singleton `EventEmitter` on `globalThis` that broadcasts 14 typed DB mutation events. Both SSE clients and outbound webhooks subscribe to the same bus. Clean decoupling between mutation producers and event consumers.

**Where:** `src/lib/event-bus.ts` (61 lines), `src/app/api/events/route.ts`, `src/lib/webhooks.ts`

**Why it matters:** Every DB mutation (task CRUD, agent status, chat message, notification, activity, audit) fires through one bus. SSE clients get instant updates. Webhooks get triggered. New consumers can subscribe without touching mutation code.

**Borrowing plan:** We already have Supabase Realtime, which is strictly better (durable, multi-instance). But the **pattern** of typed event contracts and webhook event-type mapping is worth adopting. Our webhook system should map Realtime events to webhook deliveries using a similar event-type taxonomy.

**Caveat (from Codex):** Their EventEmitter is process-local — breaks in multi-instance deployments. For us, use durable outbox + Realtime fanout, not in-process bus.

### 3. Webhook Delivery with HMAC Signing (MEDIUM-HIGH)
**What:** Outbound webhooks with HMAC-SHA256 signatures, 10s timeout via AbortController, delivery history table with automatic pruning (200 per webhook), event-type mapping from internal events, `last_fired_at` tracking.

**Where:** `src/lib/webhooks.ts` (184 lines)

**Why it matters:** Complete webhook delivery pipeline in ~180 lines. HMAC signing, delivery logging, response body capture (truncated at 1000 chars), duration tracking. This is our roadmap item "Webhook signature verification" — they've already shipped it.

**Borrowing plan:** Port the delivery model (webhook_deliveries table, HMAC signing, pruning) directly. Add retry with exponential backoff (their TODO, our opportunity to leapfrog).

### 4. Quality Review Gates (MEDIUM)
**What:** Hard server-enforced gates that block task completion without approval. Separate `quality_reviews` table. Tasks must pass through `quality_review` status before reaching `done`. Approval/rejection tracked with reviewer, notes, and timestamp.

**Where:** `src/lib/migrations.ts` (migration 002), `src/app/api/quality-review/route.ts`, `src/components/panels/task-board-panel.tsx`

**Why it matters:** We have approval gates in our pipeline (Slack approval for deploy-to-test), but they're buggy (status mismatch bug). Their approach is simpler and more robust — a DB-enforced status transition.

**Borrowing plan:** Consider adding optional quality gates to our feature lifecycle. Feature can't move to `complete` without a verification-specialist sign-off. We already have the concept — just need to enforce it at the API layer.

### 5. Smart Poll Hook (MEDIUM)
**What:** Visibility-aware polling that pauses when browser tab is hidden, resumes with immediate fetch when tab becomes visible. Supports backoff on failure, pauses when SSE or WebSocket is connected. Always fires initial fetch on mount regardless of real-time connection state.

**Where:** `src/lib/use-smart-poll.ts` (144 lines)

**Why it matters:** Reduces unnecessary API calls when users switch tabs. Auto-resumes when they come back. Configurable pause conditions. We have no equivalent UI optimization in our dashboard.

**Borrowing plan:** Port this hook directly for our dashboard polling. Simple, self-contained, zero dependencies beyond React and our store.

### 6. Rate Limiter Tiers (LOW-MEDIUM)
**What:** Four-tier in-memory rate limiting — login/critical (5/min), mutation (60/min), read (120/min), heavy (10/min). Map-based with 60s periodic cleanup. E2E test bypass flag. Critical flag prevents test bypass.

**Where:** `src/lib/rate-limit.ts` (75 lines)

**Why it matters:** Simple, no Redis needed, covers the common cases. We have rate limiting in our edge functions but it's per-function, not tiered.

**Borrowing plan:** Low priority — Supabase edge functions have their own rate limiting. But the tiered approach (login vs read vs mutation vs heavy) is a good mental model to apply.

## We Do Better

### Database & Multi-Tenancy
Postgres with RLS, proper tenant isolation at the DB level, row-level security policies. Their SQLite is limited to single-node, single-tenant. No concurrent write scaling. Their scheduler, EventBus, and rate limiter are all process-local — fundamentally unscalable.

### Pipeline Orchestration
Our feature → job decomposition → dispatch → combine pipeline is orders of magnitude more sophisticated. Their pipelines are sequential step execution (template A → template B → template C). No parallelism, no dependency graphs, no breakdown specialist, no combiner.

### Agent Autonomy
Our agents have real autonomy levels, skills arrays, role-specific system prompts, MCP tool restrictions, and multi-model routing. Their agents are status trackers (offline/idle/busy/error) with an optional soul_content field. No skill distribution, no autonomy tiers.

### Ideas → Features → Jobs Pipeline
Our structured idea intake (ideaify), triage workflow, idea promotion, feature specs, and job decomposition flow has no equivalent in their system. They have tasks on a kanban board — that's it.

### Multi-Machine Dispatch
We dispatch across machines with slot management, daemon heartbeats, and reconciliation. They're single-process on a single node.

### Structured Logging
Both use pino, but our logging integrates with the full pipeline lifecycle. Theirs is simpler but adequate for their scope.

## Architecture Observations

### Philosophy: Monolithic Simplicity
Mission Control is unapologetically monolithic. One Next.js process, one SQLite file, one WebSocket connection, one EventEmitter. This is both a strength (trivial to deploy, reason about, debug) and a ceiling (can't scale horizontally, can't survive process restarts for long-running tasks).

### SPA Shell Pattern
The entire UI is a single-page app routed through `src/app/page.tsx`. All 26 panels are client-side tab switches. This means fast panel switching but no SSR benefits for any panel content.

### Dual Real-Time Channels
They maintain two separate real-time channels:
- **SSE** (`/api/events`) for DB mutation events (local data)
- **WebSocket** for gateway communication (external agent orchestration)

This is a deliberate separation — SSE for things Mission Control controls (tasks, agents, notifications), WebSocket for things the gateway controls (sessions, spawns, cron). Smart architecture for their use case.

### Zustand Mega-Store
One massive Zustand store (~740 lines) with `subscribeWithSelector` middleware. Every domain entity lives here. LocalStorage persistence for UI state only. Chat messages capped at 500, logs at 1000. Deduplication built into addLog and addChatMessage.

### Validation Layer
Comprehensive Zod schemas for all API inputs. Clean `validateBody` helper that returns `{ data }` or `{ error: NextResponse }`. Worth noting: they have a priority enum mismatch — validation accepts `critical` but the board uses `urgent`. Codex caught this as a correctness gap.

### Security Posture
Better than expected for an open-source dashboard:
- Constant-time string comparison (both Node.js `timingSafeEqual` and edge-compatible XOR)
- CSRF origin validation in middleware
- Host allowlisting for production
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- scrypt password hashing
- Session cleanup on login
- Audit logging with IP/user-agent tracking
- Dedicated security regression tests

### Multi-Tenant Provisioning
The super-admin system is surprisingly mature for an "alpha" product. Full tenant lifecycle with:
- Bootstrap: create Linux user, directories, config files, systemd services
- Provision jobs: queued → approved → running → completed/failed
- Decommission: reverse teardown with safety checks
- Command allowlisting in the privileged daemon

This is the most operationally sophisticated part of the codebase and worth studying closely.

## Codex Second Opinion

**Model:** Codex (via codex-delegate investigate, 383 seconds)

**Key agreements:**
- EventBus decoupling pattern is valuable but must be reimplemented durably for our stack
- Webhook HMAC signing is straightforward to port
- Quality gates are worth adopting
- Our core architecture (Postgres/RLS, distributed dispatch) is definitively stronger

**Key disagreements / reordering:**
- Codex re-prioritized my steal list. Moved provisioning governance from #6 to #1 and smart polling from #1 to #5. **I agree** — for a multi-tenant SaaS, control-plane governance matters more than UI polish.
- Codex flagged that in-memory patterns (EventEmitter, Map rate limiter) **break in multi-instance deployments**. Important caveat when adapting.
- Codex noted we should use **durable outbox + Realtime fanout**, not in-process bus — confirms our Supabase Realtime approach is correct.

**Patterns I missed (Codex caught):**
1. **Provisioning governance workflow** — I undersold this. The full job lifecycle with approval gates and dry-run is more valuable than just the daemon security.
2. **Agent config drift sync** (`src/lib/agent-sync.ts`) — sync/diff/writeback pattern for fleet config hygiene. Useful for our agent config distribution.
3. **Integration/env management** — atomic `.env` writes, blocked vars, secret sync hooks.
4. **Security regression tests** — dedicated test suites for auth, CSRF, and rate limiting.

**Notable competitor intelligence (from Codex):**
- Priority enum mismatch (`urgent` vs `critical`) suggests correctness gaps
- Scheduler bootstraps from app initialization — risks duplicate jobs in scaled deployments
- Their pipeline is sequential-only, no parallelism

## Raw Notes

### Tech Stack Details
- Next.js 16 (App Router), React 19, TypeScript 5.7
- SQLite via better-sqlite3 (WAL mode, synchronous=NORMAL, cache_size=1000)
- Zustand 5 with subscribeWithSelector
- Recharts 3 for charts
- @xyflow/react for flow diagrams
- ws for WebSocket client
- pino for logging
- zod for validation
- Vitest + Playwright (146 E2E tests claimed)

### API Surface
30+ REST API routes across 8 categories: auth, core resources (tasks/agents), monitoring, configuration, operations, integrations, chat/real-time, agent lifecycle, pipelines.

### Roadmap Items (from their README)
- Agent-agnostic gateway support (not just OpenClaw)
- Direct CLI integration (Codex, Claude Code)
- Native macOS app (Electron or Tauri)
- Per-agent cost breakdowns
- OpenAPI/Swagger docs
- Webhook retry with exponential backoff
- OAuth approval UI improvements
- API token rotation UI
- Webhook signature verification

### File Counts
- `src/lib/` — 27 files
- `src/app/api/` — 30+ route directories
- `src/components/panels/` — 26 panel components
- `src/store/` — 1 mega-store file (742 lines)

### Things to Watch
- They're actively building multi-tenant provisioning — may become a more direct competitor
- Gateway-agnostic support would broaden their market
- MIT license means their patterns are freely borrowable
- v1.2.0 — moving fast, ~355 lines of README, well-documented API
