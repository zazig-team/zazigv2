# Ideas Inbox: Pre-Pipeline Capture and Triage

**Date:** 2026-02-25
**Status:** Proposal (v1 sketch)
**Author:** CPO
**Related docs:** `2026-02-24-idea-to-job-pipeline-design.md` (entry points A/B/C), `2026-02-24-software-development-pipeline-design.md` (pipeline lifecycle), `ORG MODEL.md` (tier/layer model)


___
## Tom feedback
2026-02-25 This all looks great but now we need to align the ideas in this, 2026-02-25-ideaify-inbox-proposal.md, 2026-02-25-telegram-ideas-bot-proposal.md so we're not inventing or designing multiple things that do the same thing.

---

## Problem Statement

Work enters the zazigv2 pipeline through three defined entry points:

- **Entry Point A:** Human talks to CPO, who triages and specs features
- **Entry Point B:** Standalone jobs (quick fixes, bypass CPO)
- **Entry Point C:** Monitoring Agent discovers opportunities, researches, proposes

All three assume the idea is ready to enter the pipeline in some form. In practice, many things are not ready:

- A half-formed thought during a conversation ("we should probably do something about X")
- A bug report from a user that needs triage before it becomes a job
- An agent observation that is interesting but not actionable yet
- A Telegram message at 2am that should not be lost
- A pattern the CTO notices during a code review that warrants investigation later
- A competitor move spotted by the Monitoring Agent that needs further research before becoming a proposal

Today these ideas either get lost (mentioned in a conversation but never captured), get prematurely promoted into the pipeline (creating half-specced features that clog the queue), or live in the human's head (single point of failure).

The pipeline needs a **pre-pipeline holding area** -- a place where raw ideas land, get enriched over time, and graduate to real work only when they are ready.

---

## Design Goals

1. **Capture everything, filter later.** The cost of losing an idea should be higher than the cost of triaging a bad one.
2. **Low friction input.** Ideas should be capturable from any channel (terminal, Slack, Telegram, agent-initiated) with minimal structure.
3. **Autonomous enrichment.** Agents (especially CPO) should be able to scan the inbox, add context, estimate scope, and prepare ideas for promotion -- without being asked.
4. **Clear graduation path.** An idea should promote cleanly into the existing pipeline (Entry Point A feature, Entry Point B job, or Entry Point C research proposal) with a traceable link.
5. **No shadow backlog.** The inbox must not become a graveyard. Stale ideas get surfaced, parked, or rejected -- not silently forgotten.

---

## Schema Design

### `ideas` table

Follows existing zazigv2 conventions: multi-tenant via `company_id`, UUID primary keys, `created_at`/`updated_at` timestamps, RLS with `service_role` full access and `authenticated` read-own.

```sql
CREATE TABLE public.ideas (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Content
    raw_text         text        NOT NULL,
    refined_summary  text,
    tags             text[],

    -- Source tracking
    source           text        NOT NULL DEFAULT 'terminal'
                                 CHECK (source IN (
                                     'terminal', 'slack', 'telegram',
                                     'agent', 'web', 'api', 'monitoring'
                                 )),
    originator       text        NOT NULL,  -- 'human', 'cpo', 'cto', 'cmo', 'monitoring-agent', etc.
    source_ref       text,                  -- external reference (Slack message ID, Telegram msg ID, etc.)

    -- Triage metadata
    status           text        NOT NULL DEFAULT 'new'
                                 CHECK (status IN (
                                     'new',       -- just captured, untouched
                                     'triaged',   -- reviewed, enriched, awaiting decision
                                     'promoted',  -- graduated to feature/job/research
                                     'parked',    -- interesting but not now
                                     'rejected'   -- explicitly not doing this
                                 )),
    suggested_scope  text        CHECK (suggested_scope IN ('job', 'feature', 'project', 'research')),
    suggested_exec   text,       -- which exec/role should own this ('cpo', 'cto', 'cmo')
    complexity_estimate text     CHECK (complexity_estimate IN ('trivial', 'small', 'medium', 'large', 'unknown')),
    priority         text        CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
                                 DEFAULT 'medium',

    -- Triage tracking
    triaged_by       text,       -- who triaged ('human', 'cpo', etc.)
    triaged_at       timestamptz,
    triage_notes     text,       -- reasoning for the triage decision

    -- Promotion tracking
    promoted_to_type text        CHECK (promoted_to_type IN ('feature', 'job', 'research')),
    promoted_to_id   uuid,       -- FK to features.id or jobs.id (soft reference, not enforced)
    promoted_at      timestamptz,
    promoted_by      text,       -- who promoted ('human', 'cpo', etc.)

    -- Project association (optional -- ideas may not have a project yet)
    project_id       uuid        REFERENCES public.projects(id) ON DELETE SET NULL,

    -- Timestamps
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Standard updated_at trigger
CREATE TRIGGER ideas_updated_at
    BEFORE UPDATE ON public.ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_ideas_company_id ON public.ideas(company_id);
CREATE INDEX idx_ideas_status     ON public.ideas(status);
CREATE INDEX idx_ideas_source     ON public.ideas(source);
CREATE INDEX idx_ideas_priority   ON public.ideas(priority);
CREATE INDEX idx_ideas_created_at ON public.ideas(created_at);

-- Cross-tenant protection
ALTER TABLE public.ideas ADD CONSTRAINT uq_ideas_company_id UNIQUE (id, company_id);

-- RLS
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.ideas
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.ideas
    FOR SELECT TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.ideas
    FOR INSERT TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

### Schema design rationale

**Why `raw_text` + `refined_summary`?** Raw text preserves the original thought exactly as captured. The refined summary is a cleaned-up, context-enriched version produced during triage. Both are valuable: raw for provenance, refined for scanning.

**Why `source` + `originator` as separate fields?** Source is the channel (where it came from), originator is the actor (who said it). "CTO noticed a problem during code review" = source: `terminal`, originator: `cto`. "User reported a bug on Slack" = source: `slack`, originator: `human`.

**Why soft reference for `promoted_to_id`?** Hard FK would create coupling between the ideas table and features/jobs tables. A soft reference (UUID stored as value, no constraint) keeps the ideas table independent while still allowing traceability. The `promoted_to_type` discriminator tells you which table to look in.

**Why `text[]` for tags instead of a join table?** At this stage, tags are lightweight labels for filtering (`ux`, `performance`, `infra`, `debt`, `competitor`). A join table is premature -- Postgres array operations (`@>`, `&&`) handle the filtering use cases. If tag management becomes complex (tag hierarchies, tag-based routing), a join table can be added later.

**Why no `embedding` column?** Considered and deferred. Semantic search over ideas is appealing (find similar ideas, detect duplicates), but adds infrastructure cost (vector generation on insert) and the inbox is expected to be small enough that full-text search and tag filtering suffice for v1. If idea volume grows or duplicate detection becomes important, add `embedding vector(1536)` in a later migration.

---

## Lifecycle

### Status transitions

```
                    +--> promoted (→ feature/job/research)
                    |
  new --> triaged --+--> parked
                    |
                    +--> rejected

  parked --> triaged  (resurfaced for re-evaluation)
  parked --> rejected (explicitly killed)
```

### Detailed states

| Status | Meaning | Who can set it | What happens next |
|--------|---------|---------------|-------------------|
| `new` | Just captured, no one has looked at it | Anyone (on create) | Appears in triage queue |
| `triaged` | Reviewed, enriched with summary/scope/priority | CPO (autonomous), human (manual), any exec | Ready for a promote/park/reject decision |
| `promoted` | Graduated to the pipeline | CPO or human | `promoted_to_type` and `promoted_to_id` are populated |
| `parked` | Not now, maybe later | CPO or human | Enters the "parked" pool for periodic review |
| `rejected` | Explicitly not doing this | CPO or human | Terminal state. Preserved for context ("we considered this and decided no") |

### Who triages?

Two modes, which can coexist:

**Autonomous triage (CPO inbox sweep):**
- CPO periodically scans ideas where `status = 'new'`
- For each idea, CPO enriches: writes `refined_summary`, sets `suggested_scope`, `suggested_exec`, `complexity_estimate`, `priority`
- CPO sets `status = 'triaged'`, records itself as `triaged_by`
- CPO does NOT promote autonomously in v1 -- it prepares ideas for human decision

**Human-triggered triage:**
- Human reviews the inbox (via terminal, dashboard, or asks CPO "what's in the inbox?")
- Human can triage directly (set status, scope, priority) or ask CPO to do it
- Human can promote directly ("make this a feature on project X")

### Autonomous pickup: the trust boundary

This is the most interesting design question. The pipeline already has an autonomy spectrum (see Entry Point C, "autonomy levels" in the idea-to-job pipeline doc):

| Level | Ideas inbox behaviour |
|-------|----------------------|
| **Always ask** (v1 default) | CPO triages but never promotes. Human must explicitly approve promotion. |
| **Trust but verify** | CPO can promote low-complexity ideas (trivial/small) to standalone jobs. Human notified, can halt. |
| **Full autonomy** | CPO promotes anything it assesses as ready. Human sees the result, not the decision. |

**v1 ships with "always ask."** This is deliberate. The inbox is a new surface area for agent initiative, and trust must be earned through demonstrated good triage before promotion authority is granted.

**What "autonomous triage" looks like in practice:**

The CPO's persistent agent session could include an inbox sweep as part of its periodic duties (similar to how it already reviews standalone jobs). Implementation options:

1. **Cron-triggered:** Orchestrator sends a "sweep inbox" notification to CPO on a schedule (daily, or when `new` ideas exceed a threshold)
2. **Session-integrated:** CPO checks the inbox at the start of each human conversation ("Before we begin, 3 new ideas came in since yesterday. Want me to triage them?")
3. **Event-driven:** A Supabase trigger fires when a new idea is inserted, notifying CPO via the events system

Option 2 is the lightest touch for v1 -- no new infrastructure, just a behavioural instruction in the CPO's role prompt.

---

## Promotion Mechanics

When an idea is promoted, it graduates to the existing pipeline. The promotion path depends on `promoted_to_type`:

### Promote to feature

```
idea.status = 'promoted'
idea.promoted_to_type = 'feature'
idea.promoted_to_id = {new feature UUID}
idea.promoted_at = now()
idea.promoted_by = 'cpo' | 'human'
```

**What happens:**
1. A new feature is created in the `features` table with `status = 'created'`
2. The feature's `description` is populated from the idea's `refined_summary` (or `raw_text` if no summary)
3. The idea's `project_id` determines which project the feature belongs to (if set; otherwise, CPO must assign one)
4. The feature enters the normal pipeline at Stage 4 (Feature Design) -- CPO and human spec it out via `/spec-feature`

This is Entry Point A, but with a head start: the idea already has context, scope estimate, and priority.

### Promote to job

```
idea.status = 'promoted'
idea.promoted_to_type = 'job'
idea.promoted_to_id = {new job UUID}
idea.promoted_at = now()
idea.promoted_by = 'human'  -- v1: only human can promote to job
```

**What happens:**
1. A standalone job is created with `feature_id = null` (Entry Point B)
2. The job's `context` is populated from the idea content
3. The job still requires spec + acceptance criteria before it can move to `queued` -- promotion does not skip the quality gate
4. CPO (or human) completes the spec, then the job enters the queue

### Promote to research

```
idea.status = 'promoted'
idea.promoted_to_type = 'research'
idea.promoted_to_id = null  -- no direct target yet
idea.promoted_at = now()
idea.promoted_by = 'cpo'
```

**What happens:**
1. CPO commissions a Monitoring Agent (via `commission_contractor`) with the idea as context
2. The Monitoring Agent investigates viability using its standard toolkit (`deep-research`, `repo-recon`, etc.)
3. The agent produces an internal proposal (Entry Point C)
4. The proposal cycles back through CPO for review -- may eventually become a feature or get parked

This is new: the idea becomes a research task rather than direct pipeline work. Useful for ideas that sound promising but lack evidence.

---

## MCP Tools

Four new tools for the agent MCP server, following existing patterns (`create_feature`, `update_feature`, `query_features`):

### `create_idea`

```typescript
server.tool(
  "create_idea",
  "Capture a raw idea into the ideas inbox",
  {
    raw_text: z.string().describe("The raw idea text as captured"),
    source: z.enum(["terminal", "slack", "telegram", "agent", "web", "api", "monitoring"])
      .optional().describe("Where this idea came from (default: agent)"),
    originator: z.string().describe("Who had this idea (e.g. 'human', 'cpo', 'cto')"),
    project_id: z.string().optional().describe("Project UUID if known"),
    tags: z.array(z.string()).optional().describe("Freeform tags for categorization"),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional()
      .describe("Initial priority estimate (default: medium)"),
    suggested_scope: z.enum(["job", "feature", "project", "research"]).optional()
      .describe("Initial scope estimate"),
  },
  async ({ raw_text, source, originator, project_id, tags, priority, suggested_scope }) => {
    // POST to /functions/v1/create-idea
    // Returns: { idea_id: string }
  },
);
```

### `query_ideas`

```typescript
server.tool(
  "query_ideas",
  "Query ideas from the inbox, with optional filters",
  {
    idea_id: z.string().optional().describe("Specific idea UUID"),
    status: z.string().optional().describe("Filter by status (e.g. 'new', 'triaged', 'parked')"),
    project_id: z.string().optional().describe("Filter by project"),
    source: z.string().optional().describe("Filter by source channel"),
    priority: z.string().optional().describe("Filter by priority"),
    limit: z.number().optional().describe("Max results (default: 50)"),
  },
  async ({ idea_id, status, project_id, source, priority, limit }) => {
    // POST to /functions/v1/query-ideas
    // Returns: { ideas: Idea[] }
  },
);
```

### `update_idea`

```typescript
server.tool(
  "update_idea",
  "Update an idea's metadata during triage. CPO can set status to 'new', 'triaged', 'parked', or 'rejected'. Only 'promote_idea' can set 'promoted'.",
  {
    idea_id: z.string().describe("Idea UUID"),
    refined_summary: z.string().optional().describe("Cleaned-up version of the idea"),
    status: z.enum(["new", "triaged", "parked", "rejected"]).optional()
      .describe("New status"),
    suggested_scope: z.enum(["job", "feature", "project", "research"]).optional(),
    suggested_exec: z.string().optional().describe("Which exec should own this"),
    complexity_estimate: z.enum(["trivial", "small", "medium", "large", "unknown"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    tags: z.array(z.string()).optional(),
    triage_notes: z.string().optional().describe("Reasoning for triage decision"),
    project_id: z.string().optional().describe("Associate with a project"),
  },
  async ({ idea_id, ...updates }) => {
    // POST to /functions/v1/update-idea
    // Sets triaged_by and triaged_at automatically when status moves to 'triaged'
  },
);
```

### `promote_idea`

```typescript
server.tool(
  "promote_idea",
  "Graduate an idea from the inbox into the pipeline as a feature, job, or research task. Creates the target entity and links it back to the idea.",
  {
    idea_id: z.string().describe("Idea UUID to promote"),
    promote_to: z.enum(["feature", "job", "research"]).describe("What to promote it to"),
    project_id: z.string().optional()
      .describe("Target project UUID (required for feature/job promotion)"),
    title: z.string().optional()
      .describe("Title for the created feature/job (defaults to refined_summary or raw_text)"),
    priority: z.enum(["low", "medium", "high"]).optional()
      .describe("Priority for the created entity"),
  },
  async ({ idea_id, promote_to, project_id, title, priority }) => {
    // POST to /functions/v1/promote-idea
    // Server-side:
    //   1. Validates idea exists and status is 'triaged'
    //   2. Creates feature/job/research-job based on promote_to
    //   3. Updates idea: status='promoted', promoted_to_type, promoted_to_id, promoted_at, promoted_by
    //   4. Returns: { idea_id, promoted_to_type, promoted_to_id }
  },
);
```

### Tool access by role

| Tool | CPO | CTO | CMO | Human (via dashboard) |
|------|-----|-----|-----|----------------------|
| `create_idea` | Yes | Yes | Yes | Yes |
| `query_ideas` | Yes | Yes | Yes | Yes |
| `update_idea` | Yes (triage) | Read-only | Read-only | Yes (full) |
| `promote_idea` | Yes (v1: only to feature/research) | No | No | Yes (full) |

In v1, only CPO and human can promote. CTO and CMO can create and read ideas but cannot move them through the lifecycle. This keeps the CPO as the product bottleneck (by design -- see role prompt: "product strategy, roadmap decisions, feature prioritisation").

---

## Edge Functions

Four new Supabase edge functions, mirroring the pattern of existing feature/job functions:

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `create-idea` | POST | anon key (agent) | Insert new idea |
| `query-ideas` | POST | anon key (agent) | Query with filters |
| `update-idea` | POST | anon key (agent) | Update triage metadata |
| `promote-idea` | POST | anon key (agent) | Atomic promote: create target + update idea |

`promote-idea` is the only function that writes to two tables (ideas + features/jobs). It should use a Supabase transaction to ensure atomicity -- if feature creation fails, the idea should not be marked as promoted.

---

## Integration with Existing Pipeline

### How ideas reach the inbox

| Source | Mechanism | Originator |
|--------|-----------|------------|
| Human in terminal | CPO captures during conversation, calls `create_idea` | `human` |
| Human on Slack | Slack adapter routes to `create-idea` edge function | `human` |
| Human on Telegram | Telegram adapter routes to `create-idea` edge function | `human` |
| CPO during conversation | CPO notices something worth capturing, calls `create_idea` | `cpo` |
| CTO during code review | CTO notices a pattern, calls `create_idea` | `cto` |
| Monitoring Agent | Finds something too raw for a proposal, calls `create_idea` | `monitoring-agent` |
| Web dashboard | Human submits via UI form | `human` |

### How ideas leave the inbox

| Promotion type | Pipeline entry point | What gets created |
|---------------|---------------------|-------------------|
| Feature | Entry Point A, Stage 4 | `features` row, `status = 'created'` |
| Job | Entry Point B | `jobs` row, `feature_id = null` |
| Research | Entry Point C (variant) | Contractor commissioned for research |

### Dashboard integration

The ideas inbox should be visible in the web dashboard (when it exists). Minimum viable view:

- List of ideas, filterable by status/source/priority/tags
- Triage actions (set status, enrichment fields)
- Promote action (with target type selector)
- Count badges: N new, N triaged, N parked

---

## Comparison to Existing Patterns

| Tool | What it does well | What zazigv2 can learn |
|------|------------------|----------------------|
| **Linear Triage** | Incoming issues land in a triage queue. Team assigns priority, project, cycle. Items not ready stay in triage indefinitely. | The `new -> triaged` transition mirrors this. Linear's strength is that triage is a first-class workflow, not an afterthought. |
| **Notion Databases** | Flexible schema, multiple views (board, list, timeline). Properties are freeform. | The `tags[]` array and flexible metadata fields borrow this flexibility. Notion's weakness: no clear lifecycle -- items rot in databases. |
| **GitHub Discussions** | Separates "not ready for an issue" from "tracked issue." Community can upvote. Discussions can convert to issues. | The `idea -> promoted to feature` conversion mirrors Discussions -> Issues. GitHub's strength: the conversion preserves the original discussion thread. |
| **Basecamp Hill Charts** | Ideas are on a "hill" -- uphill (figuring it out) vs downhill (making it happen). Visual progress. | The `new -> triaged` transition is the uphill phase. Promotion is "over the hill." |
| **Shape Up (Basecamp)** | Raw ideas go in the "shaping" phase before entering a cycle. Shaping = adding constraints, reducing scope, producing a pitch. Not all ideas get shaped. | The triage phase IS shaping. `refined_summary`, `suggested_scope`, `complexity_estimate` are the shaped version. The explicit `parked` and `rejected` states acknowledge that most ideas should not be built. |

The most important lesson from these tools: **the inbox must have active maintenance, or it dies.** Linear works because triage is a daily ritual. Notion databases fail because they have no built-in lifecycle pressure. The autonomous triage sweep (CPO checking the inbox) is the mechanism that prevents the zazigv2 ideas inbox from becoming a graveyard.

---

## CPO Role Prompt Changes

The CPO's role prompt should be updated to include inbox responsibilities:

```
## Ideas Inbox

You maintain the company's ideas inbox -- a pre-pipeline holding area
for raw ideas, feature requests, and half-formed thoughts.

**Periodic sweep:** At the start of human conversations, check for new
ideas (status = 'new'). Offer to triage them. For each idea:
- Write a refined_summary (1-2 sentences, actionable)
- Estimate suggested_scope (job, feature, project, research)
- Estimate complexity (trivial, small, medium, large, unknown)
- Set priority
- Add relevant tags
- Set status to 'triaged'

**Capture during conversation:** When the human mentions something that
is not ready for a feature but should not be lost, proactively capture
it as an idea. Say what you are doing ("I will capture that as an idea
in the inbox so we do not lose it").

**Do not promote autonomously in v1.** Prepare ideas for the human's
decision. Present triaged ideas with your recommendation when asked.
```

---

## Events Integration

New event types for the events table:

```sql
-- Add to events_event_type_check constraint
'idea_created', 'idea_triaged', 'idea_promoted', 'idea_parked', 'idea_rejected'
```

Events provide the audit trail. When an idea is promoted to a feature, the event chain is:
1. `idea_created` (when captured)
2. `idea_triaged` (when CPO enriches)
3. `idea_promoted` (detail: `{ promoted_to_type: 'feature', promoted_to_id: '...' }`)
4. `feature_created` (standard pipeline event, with `detail: { from_idea_id: '...' }`)

This creates full traceability from raw thought to shipped feature.

---

## Migration Plan

Single migration file: `053_ideas_inbox.sql` (or next available number).

Contents:
1. Create `ideas` table with all columns, constraints, indexes, RLS
2. Extend `events_event_type_check` with idea event types
3. No data migration needed (new table)

Estimated complexity: **simple**. No existing tables are modified (except the events constraint extension). No data migration. No FK coupling to existing tables beyond `companies` and `projects`.

---

## Implementation Sequence

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 1 | Migration: `ideas` table + events constraint | Simple | Nothing |
| 2 | Edge function: `create-idea` | Simple | Step 1 |
| 3 | Edge function: `query-ideas` | Simple | Step 1 |
| 4 | Edge function: `update-idea` | Simple | Step 1 |
| 5 | Edge function: `promote-idea` | Medium | Steps 1-4 + existing `create-feature`/job creation logic |
| 6 | MCP server: add 4 tools | Medium | Steps 2-5 |
| 7 | CPO role prompt: add inbox sweep instructions | Simple | Step 6 |
| 8 | Dashboard: ideas inbox view | Medium | Steps 2-5 (can be deferred) |

Steps 1-7 are the v1 MVP. Step 8 is a fast follow.

Total estimated effort: **4-6 jobs** (one for the migration, one for edge functions, one for MCP tools, one for CPO prompt update, optionally one for dashboard integration and one for end-to-end testing).

---

## Open Questions

### 1. Deduplication

Should the system detect duplicate ideas? Two approaches:
- **Manual:** CPO notices during triage and merges or rejects duplicates
- **Automated:** Embedding-based similarity search on insert (requires the deferred `embedding` column)

Recommendation: manual in v1. The expected volume (tens of ideas per week, not thousands) does not justify the infrastructure cost of automated dedup.

### 2. Idea comments/thread

Should ideas support a comment thread (like GitHub Discussions)? Options:
- **No thread (v1):** Ideas are single-entry. Conversation happens in the terminal or Slack.
- **Simple thread:** A `idea_comments` table or reuse the `messages` table with `idea_id` FK.
- **Rich thread:** Full threaded conversation, like a mini feature design session.

Recommendation: no thread in v1. The inbox is a capture and triage tool, not a collaboration space. If an idea needs discussion, it should be promoted to a feature where the existing CPO conversation flow handles it.

### 3. Bulk operations

Should there be a `batch_triage_ideas` tool for triaging multiple ideas at once? The CPO might want to sweep 10 ideas in one pass.

Recommendation: defer. The CPO can call `update_idea` in a loop. If this becomes a bottleneck, add a batch endpoint.

### 4. Idea expiry

Should parked ideas automatically expire after N days? Or should the CPO periodically review the parked pool?

Recommendation: periodic review over automatic expiry. Expiry loses information; review preserves the decision. Add "review parked ideas" to the CPO's periodic duties (monthly or weekly depending on volume).

### 5. Realtime subscription

Should the `ideas` table be added to the Supabase Realtime publication? This would enable the dashboard to show live updates.

Recommendation: yes, add to Realtime. The write volume is low (unlike events or memory_chunks), and live updates make the dashboard more useful.

### 6. Cross-exec idea routing

When CTO creates an idea tagged with a product concern, should it automatically route to CPO for triage? Or should all execs triage within their domain?

Recommendation: CPO triages all ideas in v1 (single point of accountability). Cross-exec routing is a v2 concern when the trust boundary is better understood.

### 7. Telegram/Slack quick capture

Should there be a shortcut syntax for capturing ideas from messaging platforms? e.g., `/idea fix the login timeout bug` in Slack creates an idea directly.

Recommendation: yes, but as a fast follow after v1. The Slack adapter already routes messages to the CPO -- adding a `/idea` command that routes to `create-idea` instead is minimal work.

---

## What This Does NOT Cover

- **Voting/upvoting:** No community prioritization. The CPO is the prioritization layer.
- **Idea templates:** No structured input forms. Raw text is the v1 interface.
- **AI-generated ideas:** The Monitoring Agent already has its own proposal pipeline (Entry Point C). This inbox captures things that are too raw even for a proposal.
- **Multi-company idea sharing:** Ideas are strictly tenant-scoped. No cross-company visibility.
- **Idea analytics:** No dashboards for idea throughput, triage time, promotion rate. Useful later but premature now.

---

## Summary

The Ideas Inbox is a lightweight Supabase table with four MCP tools and four edge functions that creates a pre-pipeline holding area for raw thoughts. Ideas are captured with minimal friction, enriched during autonomous or human-triggered triage, and promoted into the existing pipeline when ready. The CPO is the primary triage agent, operating within a "prepare but don't promote" trust boundary in v1. The system is designed to prevent both idea loss (capture everything) and idea rot (active triage lifecycle with explicit parked/rejected terminal states).

Implementation is straightforward -- it touches no existing tables (except an events constraint extension), introduces no new architectural patterns, and follows established conventions for MCP tools, edge functions, and multi-tenant RLS. The total footprint is one migration, four edge functions, four MCP tools, and a CPO prompt update.
