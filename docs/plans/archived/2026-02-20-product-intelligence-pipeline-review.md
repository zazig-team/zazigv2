# Review: Product Intelligence Pipeline Design

**Reviewed:** 2026-02-20
**Source:** `docs/plans/2026-02-20-product-intelligence-pipeline-design.md`
**Reviewer:** CPO (agent)

---

## Verdict

The design is conceptually strong — the two-role split (Market Researcher for shallow daily scans, Product Manager for deep commissioned pipelines) is well-reasoned and fits zazigv2's ephemeral agent model. The PM's 11-stage pipeline is ambitious but each stage maps to existing tooling. However, the design was written in isolation from the existing zazigv2 data model, pipeline design, and orchestrator specs. It needs reconciliation before implementation: the PM investigation should be a `job` (not a parallel lifecycle), the researcher should read features from Supabase (not roadmap markdown files), and the CPO runtime question must be resolved with Chris. After those revisions, it's ready for cardify.

---

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| CPO runtime: Claude Code vs Agent SDK | Architecture | ONE-WAY DOOR | Determines whether skills (brainstorming, review-plan, cardify) work. Entire pipeline depends on skills. Must resolve with Chris before building. Current assumption: Claude Code. |
| `signals` table schema | Data Model | HARD TO REVERSE | Once populated with historical signal data, schema changes require migration. Get it right before first production scan. |
| Pluggable source/model interface | Source Layer | HARD TO REVERSE | The module interface for source integrations locks in how extensions work. All future sources must conform. Design the interface carefully — it's the extension point for the product. |
| Agent Teams as PM ↔ CPO transport | PM Pipeline | Moderate | Agent Teams is experimental. If it doesn't stabilize, fallback to inbox protocol (flat JSON, proven pattern from v1 learnings doc). Not a hard lock — but the collaboration UX differs significantly between approaches. |

---

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| `jobs` table with `job_type` extensibility | `2026-02-19-zazigv2-data-model.md` | Designed, not built |
| `messages` table for PM ↔ CPO collaboration | `2026-02-19-zazigv2-data-model.md` | Designed, not built |
| Cron scheduler in orchestrator | `2026-02-18-orchestration-server-design.md` | GAP — not in current design |
| Agent Teams or inbox protocol | Claude Code experimental feature / v1 learnings | Available but experimental |
| `features` table (researcher reads active features) | `2026-02-19-zazigv2-data-model.md` | Designed, not built |
| Orchestrator heartbeat with per-job health metrics | `2026-02-18-orchestration-server-design.md` | GAP — current heartbeats are machine-level only |
| CPO runtime decision (Claude Code vs Agent SDK) | Architecture decision with Chris | UNRESOLVED |
| deep-research, second-opinion, repo-recon tools | Existing zazig v1 tooling | Available, may need porting |
| Supabase Vault for API key storage | Supabase project setup | Not started |

---

## Key Trade-offs

- **Parallel tables vs job integration**: Design created standalone `research_reports` table. Review recommends making PM investigations standard `jobs` with a detail extension table. Gains: single lifecycle system, dashboard/CPO standup sees all work uniformly. Loses: research-specific status granularity (stages within the pipeline become internal to the agent, not visible in the job status).

- **Roadmap files vs features table**: Design reads `docs/ROADMAP.md` from repos. Review recommends reading `features` table from Supabase. Gains: works for any company (no markdown convention required), simpler access (one table query), always current. Loses: rich narrative context that roadmap docs provide (phase descriptions, strategic rationale). Mitigation: researcher can read both — features table for what's being built, project `description` field for strategic context.

- **URL-only dedup vs semantic dedup**: Design deduplicates signals by URL. Review flags that semantic duplicates (same topic, different URLs) will slip through. Trade-off: semantic dedup is more expensive (embedding comparison) but prevents signal fatigue. Recommendation: URL dedup first, add semantic dedup as an enhancement once signal volume justifies it.

- **Cloud cron vs local cron**: Cron trigger in the cloud (orchestrator creates job on schedule) vs locally (launchd on a machine). Cloud trigger is more reliable (runs even if no machine is currently online — job queues until one connects) but adds complexity to the orchestrator.

---

## Open Questions

1. **CPO runtime**: Claude Code or Agent SDK? Blocks the entire inter-agent collaboration design. Flagged for Chris.

2. **Heartbeat depth**: Should local agent heartbeats include per-job health metrics (last activity, stuck detection) or just machine-level "alive"? Leaning B (split: cloud schedules, local agent reports richer health). This is an orchestrator-level gap, not specific to this pipeline.

3. **Signal retention**: How long do signals stay in the table? Archive dismissed signals after 30 days? Keep actioned signals forever for trend analysis?

4. **PM cost controls**: The deep pipeline is expensive (2-4 deep-research calls, multiple second opinions, repo-recon). Should there be a per-company budget cap on PM investigations per month? Or trust CPO's judgment to commission judiciously?

5. **Researcher prompt evolution**: CPO generates the researcher's prompt each run. How does the prompt improve over time? Feedback loop from dismissed signals → CPO learns what's noise? Or manual tuning?

---

## Suggested Revisions

1. **Reconcile with data model**: PM investigation is a `job` with `job_type = 'research'`. Create `research_details` as an extension table linked via `job_id`. Remove standalone `status` lifecycle from `research_reports`.

2. **Add manual trigger path**: Make `signal_id` nullable on the research details table. CPO can commission PM directly with a brief and no signal reference.

3. **Researcher reads features table, not roadmap files**: Replace `docs/ROADMAP.md` as input with a query to the `features` table (status in `proposed`, `design`, `building`). Optionally also read project `description` for strategic context.

4. **Add `company_id` to `source_configs` and `model_configs`**: These are company-scoped in a multi-tenant system.

5. **Rename `model_configs` to `research_model_configs`**: Distinguish from the orchestrator's execution model routing (complexity → model tier).

6. **Specify PM ↔ CPO transport**: Primary: Agent Teams (SendMessage, Discussion Pattern). Fallback: inbox protocol (flat JSON at `~/.local/share/zazig-{instance_id}/inboxes/`). The `messages` table in Supabase stores the persistent record after collaboration completes.

7. **Add semantic dedup as future enhancement**: Note in the design that URL dedup is Phase 1, semantic dedup (embedding comparison against existing signals) is Phase 2.

8. **Cron scheduler**: Spec the cron job system once in the orchestrator design (not per-feature). Reference it from this design. Covers: market researcher daily scan, nightly done-archiver, nightly bug-scan.

9. **Heartbeat depth (orchestrator-level)**: Add to orchestrator design as open question — local agent heartbeats should include per-job health metrics, not just machine-level status. Leaning toward split model (B): cloud triggers + scheduling, local agent reports rich health data.
