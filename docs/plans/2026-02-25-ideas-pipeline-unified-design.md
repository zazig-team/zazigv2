# Ideas Pipeline: Unified Design

**Date:** 2026-02-25
**Status:** Draft (alignment document -- awaiting deep-dive brainstorms per layer)
**Author:** CPO
**Supersedes:** Four separate proposals, now archived in `docs/plans/archive/`:
- `2026-02-25-ideas-inbox-proposal.md` (data layer)
- `2026-02-25-ideaify-skill-proposal.md` (processing layer)
- `2026-02-25-telegram-ideas-bot-proposal.md` (mobile capture)
- `2026-02-25-idea-visualiser-proposal.md` (presentation layer)

---

## Why This Document Exists

The four archived proposals each designed a piece of the same system independently. They produced overlapping table schemas, conflicting field naming, duplicate MCP tool definitions, and unclear boundaries between processing and triage. This document merges them into a single architecture with clean layer boundaries, one canonical data model, and a clear picture of how ideas flow from raw thought to pipeline entry.

---

## The System in One Picture

```
CAPTURE ──────→ PROCESS ──────→ STORE ──────→ TRIAGE ──────→ PRESENT

Telegram Bot     Ideaify         Ideas         CPO            Idea
Terminal         Skill           Inbox         Sweep          Visualiser
Slack                            (table)
Voice notes                      MCP tools
Email                            Edge fns
Agent-discovered
```

Five layers. Each has one job. No layer does another layer's job.

| Layer | Responsibility | Does NOT do |
|-------|---------------|-------------|
| **Capture** | Receive raw input from any channel, transcribe voice, route to processing | Clean, categorise, triage, or store ideas |
| **Process** | Clean, split, categorise raw input into structured idea records | Prioritise, decide, research feasibility |
| **Store** | Persist ideas with lifecycle state, expose via MCP tools | Process input, make triage decisions |
| **Triage** | Enrich, prioritise, promote or park ideas | Capture, process, or render |
| **Present** | Render ideas and documents for human review and approval | Modify data, make decisions |

---

## Layer 1: Capture

Capture channels get raw input into the system. Their only job is to receive, optionally transcribe, and hand off to the processing layer.

### Channels

| Channel | Input type | Transcription needed | How it reaches ideaify |
|---------|-----------|---------------------|----------------------|
| **Terminal** | Text | No | CPO receives message, recognises raw idea, runs ideaify skill |
| **Telegram** | Voice + text | Yes (voice) | Bot receives message, transcribes if voice, calls `create_idea` MCP tool with `raw=true` flag (triggers ideaify processing), or routes to ideaify skill directly |
| **Slack** | Text | No | Slack adapter routes to `create_idea` with `raw=true` |
| **Agent-discovered** | Structured text | No | Agent calls `create_idea` directly -- already structured, skips ideaify |
| **Web/API** | Text | No | Direct POST to edge function |

### Key design decision: capture channels do not process

The Telegram bot's job is: receive message, transcribe voice to text, hand off. It does not clean, categorise, or split ideas. That's ideaify's job. This means:

- The bot's pipeline simplifies from 6 stages to 3: **receive → transcribe → hand off**
- All channels benefit from the same processing quality (ideaify improves once, everywhere)
- New capture channels (email, WhatsApp, web form) are trivial to add -- just route text to ideaify

### Voice transcription

Voice transcription is the one processing step that belongs in the capture layer, because:
1. It transforms a non-text format into text (ideaify only accepts text)
2. It's mechanical, not intelligent -- no product judgment involved
3. Different channels may use different transcription services

Recommended: OpenAI `gpt-4o-transcribe` for quality. Transcription happens in the capture channel (Telegram bot, Slack adapter) before routing to ideaify. The transcript is the `raw_text` that gets stored.

---

## Layer 2: Process (Ideaify Skill)

Ideaify sits between raw input and the ideas inbox. It takes messy text and produces clean, categorised, individual idea records. It is a data-cleaning step, not a product-strategy step.

### What ideaify does

1. **Read and understand** the raw input
2. **Split** multi-idea inputs into individual ideas (conservative -- when in doubt, don't split)
3. **Clean** each idea into a clear title + description
4. **Categorise** by scope, complexity, domain, and autonomy level
5. **Tag** with relevant metadata
6. **Flag** ambiguity, potential duplicates, items needing clarification
7. **Write** structured records to the ideas inbox via MCP tools

### What ideaify does NOT do

- Decide whether an idea is good or bad (CPO does that)
- Research feasibility (research contractors do that)
- Prioritise ideas (CPO does that)
- Create features, jobs, or projects (CPO does that via promote)
- Ask the human for clarification (flags what's unclear and moves on)

### Runner model

**Phase 1 (immediate):** Ideaify is a skill invoked by whatever agent receives raw input. In practice, that's the CPO (terminal channel) or capture adapters (Telegram, Slack). When the CPO receives a messy input, it recognises the need for processing and runs ideaify before triaging.

**Phase 2 (when volume justifies):** Ideaify becomes a contractor role (`intake-processor`). The orchestrator dispatches it automatically when raw input arrives. The CPO is notified of processed ideas, not raw input. Same skill, different runner -- no skill rewrite needed.

### Interaction with /internal-proposal

The existing `/internal-proposal` skill takes a captured idea and turns it into a structured proposal. Ideaify and `/internal-proposal` are sequential steps, not competing alternatives:

```
Raw input → ideaify → idea record in inbox
                            ↓
                      CPO triages
                            ↓ (if scope = feature or initiative)
                      /internal-proposal → proposal in docs/plans/
                            ↓
                      Idea Visualiser renders for review
```

Ideaify handles the messy-input-to-clean-idea step. `/internal-proposal` handles the clean-idea-to-structured-proposal step. No overlap.

### Multi-idea splitting rules

This is ideaify's most valuable function. The rules:

- **One idea per record.** 5 ideas in one voice note = 5 records.
- **Preserve attribution.** Every split idea links to the source via `source_ref`.
- **Preserve context.** If idea #3 only makes sense in context of idea #1, include enough context to stand alone.
- **When in doubt, don't split.** "Add dark mode and a theme picker" = one idea. "Fix the login bug, and also add analytics" = two.
- **Annotate relationships.** Split siblings get linked via `related_ideas`.

### Handling ambiguity

Ideaify does not ask for clarification. It processes what it has and marks gaps:

- `needs-clarification: scope unclear -- could be a quick fix or a multi-feature initiative`
- `needs-clarification: domain ambiguous -- touches both product and engineering`
- `needs-clarification: may overlap with feature 'Dark Mode Support' (uuid)`
- `needs-clarification: vague -- "make it better" has no actionable detail`

The CPO (or human) provides clarification later during triage.

---

## Layer 3: Store (Ideas Inbox)

The ideas inbox is a Supabase table with MCP tools and edge functions. It is the single source of truth for all ideas in the system.

### Canonical `ideas` table schema

This is the merged schema -- one table, one set of field names, combining the best of the archived proposals.

```sql
CREATE TABLE public.ideas (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Content (raw + processed)
    raw_text          text        NOT NULL,
    title             text,
    description       text,

    -- Source tracking
    source            text        NOT NULL DEFAULT 'terminal'
                                  CHECK (source IN (
                                      'terminal', 'slack', 'telegram',
                                      'agent', 'web', 'api', 'monitoring'
                                  )),
    originator        text        NOT NULL,
    source_ref        text,

    -- Processing metadata (set by ideaify)
    scope             text        CHECK (scope IN ('job', 'feature', 'initiative', 'project', 'research', 'unknown')),
    complexity        text        CHECK (complexity IN ('trivial', 'small', 'medium', 'large', 'unknown')),
    domain            text        CHECK (domain IN ('product', 'engineering', 'marketing', 'cross-cutting', 'unknown')),
    autonomy          text        CHECK (autonomy IN ('exec-can-run', 'needs-human-input', 'needs-human-approval', 'unknown')),
    tags              text[],
    flags             text[],
    clarification_notes text,
    processed_by      text,

    -- Relationships
    related_ideas     uuid[],
    related_features  uuid[],
    project_id        uuid        REFERENCES public.projects(id) ON DELETE SET NULL,

    -- Triage metadata (set by CPO during sweep)
    status            text        NOT NULL DEFAULT 'new'
                                  CHECK (status IN ('new', 'triaged', 'promoted', 'parked', 'rejected')),
    priority          text        CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
                                  DEFAULT 'medium',
    suggested_exec    text,
    triaged_by        text,
    triaged_at        timestamptz,
    triage_notes      text,

    -- Promotion tracking
    promoted_to_type  text        CHECK (promoted_to_type IN ('feature', 'job', 'research')),
    promoted_to_id    uuid,
    promoted_at       timestamptz,
    promoted_by       text,

    -- Timestamps
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER ideas_updated_at
    BEFORE UPDATE ON public.ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_ideas_company_status ON public.ideas(company_id, status);
CREATE INDEX idx_ideas_company_domain ON public.ideas(company_id, domain);
CREATE INDEX idx_ideas_source ON public.ideas(source);
CREATE INDEX idx_ideas_created_at ON public.ideas(created_at);
CREATE INDEX idx_ideas_tags ON public.ideas USING GIN (tags);
CREATE INDEX idx_ideas_flags ON public.ideas USING GIN (flags);

-- Full-text search for duplicate detection
CREATE INDEX idx_ideas_fts ON public.ideas
    USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

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

**`raw_text` is always preserved.** The original messy input is never modified. This is the audit trail and the fallback.

**`title` + `description` are the processed versions.** Ideaify writes these. If an idea enters via a structured channel (agent-discovered, web form), they may be populated directly without ideaify.

**`source` + `originator` are separate.** Source = channel (where). Originator = actor (who). "CTO noticed a problem during review" = source: `terminal`, originator: `cto`.

**`scope` uses `initiative` not `research`.** Research is a promotion path, not a scope. An idea's scope is about work size. Research is what you do when you don't know the scope yet.

**`priority` exists but is set during triage, not processing.** Ideaify does not prioritise. The CPO sets priority during sweep.

**`flags` and `clarification_notes` carry ideaify's uncertainty.** These are how ideaify says "I wasn't sure about this" without blocking.

**`related_ideas` and `related_features` are UUID arrays, not join tables.** At this volume, array operations are simpler than join tables. Revisit if relationships become complex.

**No `embedding` column in v1.** Deferred. Volume is too low to justify vector infrastructure. Full-text search index handles duplicate detection.

### Lifecycle

```
                  +-→ promoted (→ feature/job/research)
                  |
new ──→ triaged --+-→ parked
                  |
                  +-→ rejected

parked ──→ triaged  (resurfaced)
parked ──→ rejected (killed)
```

| Status | Set by | Meaning |
|--------|--------|---------|
| `new` | Ideaify / capture channel | Just created. No one has looked at it. |
| `triaged` | CPO (sweep) or human | Reviewed, enriched, ready for a decision. |
| `promoted` | CPO or human (via `promote_idea`) | Graduated to pipeline. `promoted_to_type` and `promoted_to_id` populated. |
| `parked` | CPO or human | Not now, maybe later. Reviewed periodically. |
| `rejected` | CPO or human | Not doing this. Terminal state. Preserved for context. |

### MCP tools (one canonical set)

| Tool | Purpose | Used by |
|------|---------|---------|
| `create_idea` | Insert a new idea | Any agent, capture adapters |
| `query_ideas` | Query with filters + full-text search | Any agent |
| `update_idea` | Update triage fields (status, priority, tags, notes) | CPO, human |
| `promote_idea` | Atomic promote: create target entity + update idea | CPO, human |
| `batch_create_ideas` | Insert multiple ideas (for multi-idea splits) | Ideaify |

Five tools. One definition. All layers reference these.

### Edge functions

| Function | Method | Purpose |
|----------|--------|---------|
| `create-idea` | POST | Insert new idea |
| `query-ideas` | POST | Query with filters |
| `update-idea` | POST | Update triage metadata |
| `promote-idea` | POST | Atomic promote (writes to ideas + features/jobs) |
| `batch-create-ideas` | POST | Insert multiple ideas atomically |

### Promotion mechanics

When an idea is promoted, it graduates to the existing pipeline:

**Promote to feature:** Creates a `features` row with `status = 'created'`. Feature description populated from the idea's `title` + `description`. Enters pipeline at Stage 4 (Feature Design) with a head start -- scope, domain, and priority already estimated.

**Promote to job:** Creates a standalone `jobs` row with `feature_id = null` (Entry Point B). Job context populated from the idea. Still requires spec + acceptance criteria before queuing.

**Promote to research:** CPO commissions a research contractor with the idea as context. The contractor investigates and may produce an `/internal-proposal`. The proposal cycles back for CPO review.

### Events integration

New event types:
- `idea_created`
- `idea_triaged`
- `idea_promoted` (detail includes `promoted_to_type` and `promoted_to_id`)
- `idea_parked`
- `idea_rejected`

Full traceability chain: `idea_created` → `idea_triaged` → `idea_promoted` → `feature_created` (with `from_idea_id` in detail).

---

## Layer 4: Triage (CPO Sweep)

The CPO is the triage agent. It reviews new ideas, enriches them, and decides what happens next. This is not a separate system -- it's a behavioural addition to the CPO's existing role.

### CPO inbox sweep

Added to the CPO's periodic duties (standup, start of conversation):

1. Query ideas where `status = 'new'`, ordered by `created_at`
2. For each idea:
   - Review `title`, `description`, `flags`, `clarification_notes`
   - Refine if needed (update `description`, add `tags`)
   - Set `priority`
   - Set `suggested_exec` (which exec should own this)
   - Set `status = 'triaged'`
3. Present triaged ideas to human with recommendation: promote, park, or reject

### Trust boundary

**v1: "Always ask."** CPO triages but never promotes autonomously. Human must explicitly approve promotion.

**v2 (earned trust):** CPO can promote low-complexity ideas (trivial/small scope, `exec-can-run` autonomy) to standalone jobs. Human notified, can halt.

**v3 (full autonomy):** CPO promotes anything it assesses as ready. Human sees the result, not the decision.

### Inbox hygiene

- During standup, report `new` idea count
- Ideas older than 7 days still at `new` get flagged
- `parked` ideas reviewed monthly during sprint planning
- `rejected` ideas preserved indefinitely (context for "we considered this")

---

## Layer 5: Present (Idea Visualiser)

The visualiser renders ideas and documents for human review outside the terminal. It works at multiple stages of the lifecycle, not just for raw ideas.

### What it renders

| Stage | Source | Template |
|-------|--------|----------|
| Raw idea | `ideas` table, `status = 'new'` | Compact card: raw text, source, flags |
| Triaged idea | `ideas` table, `status = 'triaged'` | Enriched card: title, description, scope, priority, CPO recommendation |
| Proposal | `docs/plans/*-proposal.md` | Full document with sections, trade-off tables, decision highlights |
| Design/spec | `docs/plans/*-design.md` | Architecture diagrams, component breakdown, acceptance criteria |
| Feature in pipeline | `features` table + linked idea | Status tracker: idea → feature → jobs → shipped |

### Approval workflow

Each rendered view includes interactive actions:

- **Approve** -- CPO proceeds (promotes idea, specs feature, ships design)
- **Reject** -- with reason, feeds back to the idea/proposal
- **Comment** -- inline feedback that routes to the CPO's next session
- **Request changes** -- specific sections flagged for revision

### Hosting

Private Netlify deployment with Basic Auth. Vanilla HTML + CSS, Mermaid.js for diagrams, reads from Supabase (ideas table) and the repo (docs/plans/). Auto-regenerates when source data changes.

### Deep-link back to CPO

Every rendered view includes a deep-link that opens the relevant context in a CPO conversation: "Discuss this idea", "Refine this proposal", "Approve this spec". This closes the loop between mobile review and terminal action.

---

## How the layers connect

### Flow 1: Voice note on the go

```
Tom records voice note on Telegram
    → Telegram bot receives audio
    → Bot transcribes via gpt-4o-transcribe
    → Bot calls create_idea(raw_text=transcript, source='telegram', originator='human')
    → Ideaify processes: splits 3 ideas, categorises each
    → 3 idea records written to inbox via batch_create_ideas
    → CPO notified: "3 new ideas from Telegram"
    → CPO triages during next sweep
    → Tom reviews on Idea Visualiser (phone)
    → Tom approves promotion of idea #2
    → CPO promotes to feature, runs /internal-proposal
    → Proposal rendered on Visualiser for final review
```

### Flow 2: Terminal conversation

```
Tom tells CPO: "we should fix the auth timeout and also add rate limiting"
    → CPO recognises multi-idea input, runs ideaify
    → Ideaify splits into 2 ideas, writes to inbox
    → CPO immediately triages (same conversation):
        "Auth timeout looks like a job-sized fix. Rate limiting is a feature. Want me to promote both?"
    → Tom approves
    → Auth timeout promoted to standalone job
    → Rate limiting promoted to feature, enters spec pipeline
```

### Flow 3: Agent-discovered opportunity

```
Monitoring Agent spots a competitor feature
    → Agent calls create_idea(raw_text=analysis, source='monitoring', originator='monitoring-agent')
    → Already structured -- skips ideaify
    → Idea enters inbox with status='new', domain='product'
    → CPO triages during sweep, promotes to research
    → Research contractor investigates, produces /internal-proposal
    → Proposal rendered on Visualiser for Tom's review
```

---

## Implementation sequence

| Phase | What | Layers | Effort |
|-------|------|--------|--------|
| **1** | Ideas table migration + MCP tools + edge functions | Store | 3-4 jobs |
| **2** | Ideaify skill file + CPO role prompt update | Process + Triage | 2 jobs |
| **3** | Telegram bot (capture + transcribe + route) | Capture | 4-5 jobs |
| **4** | Idea Visualiser (render + approve) | Present | 5-7 jobs |

Phase 1 is the foundation -- everything else depends on the table and tools existing. Phase 2 is lightweight (skill file + prompt change). Phase 3 and 4 are independent of each other and can be parallelised.

Total: ~14-18 jobs across 4 phases.

---

## What's still open (for deep-dive brainstorms)

Each layer has unresolved design questions that need a focused session:

### Capture layer (Telegram bot)
- Voice transcription service choice and fallback strategy
- Bot personality and confirmation UX (what does the bot say back?)
- Offline/retry behaviour for poor connectivity
- Multi-language support (Tom travels)

### Processing layer (Ideaify)
- Exact skill prompt wording (draft exists in archived proposal, needs revision against unified schema)
- Duplicate detection threshold -- how similar is "similar enough" to flag?
- Should ideaify run as a contractor in Phase 2, or is the CPO-runs-it model sufficient long-term?

### Storage layer (Ideas inbox)
- Realtime subscription for dashboard updates?
- Idea comments/threads, or keep the inbox as a flat capture tool?
- Bulk triage operations (batch_update_ideas)?
- Idea expiry policy for parked items

### Triage layer (CPO sweep)
- Standalone `/triage-ideas` skill or built into standup?
- Autonomy escalation criteria -- what earns the CPO promotion authority?
- Cross-exec routing (CTO creates product idea -- auto-route to CPO?)

### Presentation layer (Idea Visualiser)
- Template design per document type
- Auth model (Basic Auth vs Supabase Auth vs magic links)
- Real-time updates vs regenerate-on-demand
- Mobile responsiveness requirements (Tom reviews on phone)

---

## Relationship to existing proposals

This document unifies and supersedes the four archived proposals. Their content is preserved in `docs/plans/archive/` for reference. Key decisions carried forward:

| From proposal | Decision kept | Decision changed |
|---------------|--------------|-----------------|
| Ideas Inbox | Lifecycle model (new→triaged→promoted/parked/rejected), promotion mechanics, events integration, CPO sweep concept | Schema field names unified, priority column kept but moved to triage phase |
| Ideaify Skill | Processing-not-judging principle, multi-idea splitting rules, ambiguity flagging, Phase 1/2 runner model | Schema now references inbox canonical model, domain/autonomy fields merged into inbox schema |
| Telegram Bot | Voice transcription in capture layer, gpt-4o-transcribe recommendation | 6-stage pipeline simplified to 3 (receive→transcribe→hand off), processing removed from bot |
| Idea Visualiser | Multi-stage rendering, approval workflow, deep-link back to CPO, Netlify hosting | Scope expanded from "spec visualiser" to full lifecycle rendering per Tom's feedback |

---

## Summary

The Ideas Pipeline is five layers: Capture, Process, Store, Triage, Present. Each layer has one job and clean boundaries with its neighbours. The `ideas` table is the single source of truth. Ideaify is the processing engine. The CPO is the triage authority. The Visualiser is the human review surface. Capture channels are thin adapters that route raw input to processing.

Four proposals, one system.
