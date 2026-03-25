# Recon: openclaw/lobster
*Analyzed: 2026-02-26 | Commit: 00cedae | Compared against: zazigv2*

## TL;DR

- Lobster is a **workflow runtime for AI agents** — typed JSON pipelines, hard approval gates, resume tokens, composable recipes. Think "Zapier for agents, but with human checkpoints."
- The killer concept for zazig: **skills/tools as composable pipeline stages** with typed contracts, not just prose instructions. One call replaces multi-step MCP sequences.
- **Hard approval gates** — not prompt suggestions, but execution halts. The pipeline literally cannot proceed. We enforce approvals via role prompts; Lobster enforces them at the runtime level.
- **Resume tokens** serialize exact pipeline state. When a workflow halts for approval, it emits a token. The caller resumes from that exact point — even across sessions.
- Codex second opinion found **two real bugs in our current approval path** while validating these findings.

## Steal List

### 1. Structured Runtime Envelope (Priority: Highest)

**What it is:** Every Lobster operation returns `{ ok, status, output, requiresApproval, resumeToken, error }`. Status is always one of: `ok`, `needs_approval`, `cancelled`, `error`. No ambiguity. No ad hoc control flow.

**Why it matters:** Our orchestrator uses different patterns for different transitions — CAS guards, status polling, Slack text parsing, Realtime broadcasts. There's no single response contract. Lobster proves you can have one.

**Borrowing plan:** Define a `PipelineStageResult` type for all feature transitions. Every edge function, every MCP tool response, every agent completion follows the same envelope. When something needs approval, it returns `needs_approval` + resume context, not a Slack message.

### 2. Hard Approval Gates as DB Policy (Priority: High)

**What it is:** Lobster's `approve()` primitive causes a hard halt — the runtime stops, emits an approval request with preview data, and returns a resume token. The pipeline is physically unable to continue until explicit approval.

**Why it matters:** Our approval enforcement is layered across: role prompts ("don't promote without human approval"), Slack text parsing (`APPROVE_PATTERNS` regex), and CAS guards on status transitions. Codex found that Slack approval lookup checks `status = "testing"` but deploy completion sets `ready_to_test` — a real mismatch. And Slack emits `machineId = null` for approval/reject but validators require non-empty `machineId`.

**Borrowing plan:** Create an `approval_requests` table. Certain transitions (feature → ready_for_breakdown, idea → promoted, verify → deploy_to_prod) insert an approval request row instead of executing directly. The transition is gated by `approval_requests.approved_at IS NOT NULL`. Slack, CLI, and dashboard all write to the same table. No more regex parsing as the approval mechanism.

### 3. Composable Macro Operations (Priority: High)

**What it is:** Lobster lets you compose stages into named workflows callable in one step:
```typescript
new Lobster()
  .pipe(ghPrView({ repo, pr }))
  .pipe(diffLast(key))
  .pipe(formatResult)
  .meta({ name: 'github.pr.monitor' })
```
One call. Typed. Cacheable.

**Why it matters:** Right now, "spec a feature and push it to breakdown" requires: `update_feature` (set spec) → `update_feature` (set acceptance_tests) → `update_feature` (set human_checklist) → `update_feature` (set status to ready_for_breakdown). Four MCP calls. With macro composition, this becomes `pipeline.specAndBreakdown(featureId, { spec, acceptance_tests, human_checklist })` — one call, transactional, with invariant checks.

**Borrowing plan:** Add server-side Edge Function macro commands (RPC endpoints) for the highest-value multi-step operations. Start with: `spec_and_submit_feature`, `promote_idea_to_feature`, `reset_and_rebreak_feature`. Each is a single HTTP call that does the full sequence transactionally with idempotency keys.

### 4. Typed Stage Contracts for Skills (Priority: Medium)

**What it is:** Every Lobster stage has a typed interface — it takes `{ input: AsyncIterable, ctx }` and returns `{ output: AsyncIterable, halt?: boolean }`. Stages can be composed because their contracts are compatible.

**Why it matters:** Our skills are prose markdown files copied into agent workspaces. They have no typed contract — no declared inputs, no guaranteed outputs, no composability. You can't chain `spec-feature` into `breakdown` programmatically because neither declares what it produces. Skills are instructions, not functions.

**Borrowing plan:** Add optional YAML frontmatter to skill files:
```yaml
---
name: spec-feature
inputs:
  featureId: { type: string, required: true }
  description: { type: string, required: true }
outputs:
  spec: { type: string }
  acceptance_tests: { type: string }
  human_checklist: { type: string }
triggers_transition: ready_for_breakdown
---
```
This is metadata, not enforcement — agents still read prose — but it enables the orchestrator to validate transitions and enables future composition. Start with the 3 highest-value skills: `spec-feature`, `breakdown`, `verify`.

### 5. Resume Tokens for Pipeline Continuity (Priority: Medium)

**What it is:** When Lobster halts at an approval gate, it encodes the entire pipeline state into a base64 token: which stage stopped, accumulated data, what comes next. The caller stores the token and passes it back to resume.

**Why it matters:** When our pipeline stalls (approval needed, agent dies, human review), recovery is blunt — we requeue the whole job. There's no way to say "this feature was 80% through verification, resume from the assertion that failed." We either restart or manually patch DB state.

**Borrowing plan:** Don't carry state in the token (Codex's caveat is correct — tokens should reference persisted state, not embed it). Add a `pipeline_checkpoints` table: `{ feature_id, stage, checkpoint_data JSONB, created_at }`. When a feature transitions, write a checkpoint. When recovering, read the latest checkpoint and resume from that stage. Token is just the checkpoint ID.

### 6. LLM-in-Pipeline for Quality Gates (Priority: Lower)

**What it is:** Lobster's `llm_task.invoke` embeds LLM calls as pipeline stages with: schema validation on output (AJV), bounded retries (prompt-with-errors), content-addressed caching (sha256 of prompt + artifacts), and run-state persistence.

**Why it matters:** Some pipeline transitions need judgment — "is this spec good enough for breakdown?", "does this combined code actually work?". Currently the LLM judgment happens inside the agent's session, with no caching, no schema enforcement, and no way to reuse the result.

**Borrowing plan:** For quality gates (spec review, verification assertion checking), create a lightweight LLM evaluator function that: (a) takes structured input, (b) validates output against a schema, (c) caches by content hash, (d) returns pass/fail + reasoning. Wire this into the orchestrator as a pre-transition check. **Never** let LLM judgment trigger irreversible side effects directly — always gate with approval.

## We Do Better

### Multi-Agent Orchestration
Lobster is strictly linear pipelines — stage A → stage B → stage C. We have concurrent agents working in parallel on different jobs within a feature, with dependency resolution. Our DAG-based job execution is fundamentally more powerful than Lobster's sequential model.

### Database-Backed State
Lobster uses file-based JSON state (`~/.lobster/state/key.json`). Fine for local workflows. We use Supabase with CAS guards, RLS, and concurrent-safe transitions. Our state management is production-grade; Lobster's is prototype-grade.

### Role-Based Access Control
Our agents have scoped MCP tools per role — CPO can't write code, engineers can't promote ideas. Lobster has zero auth model. Any caller can invoke any workflow. For a multi-agent system with trust boundaries, our approach is more mature.

### Complex Dependency Graphs
Our jobs have cross-feature dependencies, `depends_on` relationships, and the orchestrator handles topological dispatch. Lobster workflows are strictly linear with no branching or fan-out.

### Event-Driven Architecture
Codex correctly noted that our Realtime + polling catch-up is already more sophisticated than Lobster's snapshot-diff approach. We should evolve toward append-only transition events + consumers, not adopt Lobster's diffLast pattern wholesale.

## Architecture Observations

### Design Philosophy
Lobster is built on a clear insight: **most agent workflows are deterministic sequences with a few judgment points**. The LLM should decide *which* workflow to run, not re-plan every step. This is the same insight behind our feature → jobs decomposition, but Lobster applies it at a finer grain.

### Plugin Architecture Choice
Lobster is deliberately separate from OpenClaw core. This mirrors our own architecture — skills and MCP tools are extensions, not core pipeline logic. The lesson: keep the runtime small, make capabilities composable.

### The Dual Interface Pattern
Lobster offers both a CLI (`lobster "exec ... | where ... | approve"`) and an SDK (`new Lobster().pipe(exec(...)).pipe(approve(...))`). The CLI is for humans tinkering; the SDK is for agents invoking programmatically. We have the CLI (zazig commands) and MCP tools — but they're not the same abstraction. A unified interface that works for both humans and agents is worth considering.

### YAML Workflow Files
Lobster's `.lobster` files are declarative workflow definitions:
```yaml
name: inbox-triage
steps:
  - id: collect
    command: inbox list --json
  - id: categorize
    command: inbox categorize --json
    stdin: $collect.stdout
  - id: approve
    command: inbox apply --approve
    stdin: $categorize.stdout
    approval: required
  - id: execute
    command: inbox apply --execute
    stdin: $categorize.stdout
    condition: $approve.approved
```
This is essentially what our feature specs *aspire* to be — a declarative description of a workflow with data flowing between steps. The difference is we express this in prose and let agents interpret it. Lobster expresses it in typed YAML and lets a runtime execute it.

## Codex Second Opinion

**Consulted:** Codex (codex-delegate), 322s, reviewed actual zazigv2 codebase.

**Verdict:** "Directionally right. I'd adopt all 6, but with stricter implementation details and ordering."

### Where Codex Agreed
- All 6 recommendations validated as sound
- Typed skill contracts: "yes, but scope it correctly — versioned JSON schemas per workflow stage"
- Hard approval gates: "strongly agree — make approvals first-class data, block transitions by DB policy"
- Composable macros: "prefer server-side transactional macros with idempotency, audit, and invariants"
- LLM judgment: "agree for bounded decisions — add schema validation, retries, cache keys, strict timeout/circuit-breaker"

### Where Codex Pushed Back
- **Resume tokens:** "Token should reference persisted state, not carry it." Lobster embeds state in the token; for a DB-backed system like ours, the token should be a checkpoint ID pointing to a row.
- **diffLast pattern:** "Better than naive polling, but event/outbox is better than snapshot diff." Our Realtime + polling catch-up is already more sophisticated. Evolve toward append-only transition events, don't adopt Lobster's file-based diffing.

### Bugs Found During Review
Codex found two real bugs in our approval path while validating recommendation #2:

1. **Status mismatch:** Slack approval lookup checks `status = "testing"` at `slack-events/index.ts:163`, but deploy completion sets status to `ready_to_test` at `orchestrator/index.ts:2624`. These will never match.

2. **machineId contract violation:** Slack emits `machineId = null` for approval/reject at `slack-events/index.ts:193`, but `isFeatureApproved` validator requires non-empty `machineId` at `validators.ts:281`. Approvals from Slack will always fail validation.

### What Codex Added (Things I Missed)
- **Runtime guardrails:** Lobster has timeouts and output limits at execution boundaries. Our pipeline has no per-stage timeout — agents can run indefinitely on a stuck task.
- **Structured runtime envelope:** Not just for responses — for the entire runtime contract. Every stage, every transition, same shape.
- **Workflow-level condition/approval primitives in declarative files:** Not just in code, but in the workflow definition format itself.

### Codex's Recommended Priority Order
1. Fix approval correctness first (status mismatch + machineId contract)
2. Add first-class approval + resume state tables
3. Introduce typed stage contracts for highest-value paths only
4. Add idempotent macro commands
5. Then layer LLM judgment/caching

## Raw Notes

### Lobster's stdlib Commands
Full registry of pipeline commands: `exec`, `head`, `json`, `pick`, `table`, `where`, `sort`, `dedupe`, `template`, `map`, `group_by`, `approve`, `clawd.invoke`, `llm_task.invoke`, `state.get`, `state.set`, `diff.last`, `workflows.list`, `workflows.run`, `gog.gmail.search`, `gog.gmail.send`, `email.triage`.

Data-shaping commands (`where`, `pick`, `sort`, `group_by`) are JQ-like but for JSON arrays. This is an interesting pattern — agent-friendly data transformation without LLM tokens.

### Lobster's Recipe Pattern
Recipes are pre-built workflow compositions with metadata:
```typescript
prMonitor.meta = {
  name: 'github.pr.monitor',
  requires: ['gh'],
  args: { repo: { type: 'string', required: true }, ... }
};
```
The `requires` field declares CLI tool dependencies. The `args` field declares typed parameters. This is the skill contract metadata pattern we should steal.

### Token Economics
Lobster's core argument: a 10-step workflow via LLM planning costs 10 tool calls with planning overhead each. Via Lobster: 1 tool call + compact structured output. This is directly relevant to our pipeline — breakdown, combining, and verification all involve multi-step agent work that could be partially deterministic.

### Codebase Size
~105KB of TypeScript. Zero runtime dependencies beyond `ajv` (schema validation) and `yaml` (workflow file parsing). Clean, well-documented, MIT licensed. Could be vendored or used as inspiration without licensing concerns.

### Maturity
Published January 2026. Two releases. Actively developed as part of OpenClaw ecosystem. Early but architecturally coherent.
