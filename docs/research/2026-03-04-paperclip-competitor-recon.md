# Paperclip Competitor Recon

**Date:** 2026-03-04
**Repo:** https://github.com/paperclipai/paperclip
**Stars:** 656 | **Forks:** 73 | **Commits:** 340 | **First commit:** 2026-02-16
**Solo developer:** "Dotta" (all 340 commits)
**License:** MIT | **Version:** 0.2.5 | **~33k lines TypeScript**

---

## 1. What They Do

Paperclip is a control plane for autonomous AI companies. The tagline: "If OpenClaw is an employee, Paperclip is the company."

**Core product:** A Node.js server + React UI that orchestrates teams of AI agents as a virtual company. You define goals, org charts, budgets, and agent configurations. Agents wake on heartbeats, check their assigned tasks, do work, and report back.

**Target user:** Solo founders or small teams running multiple AI agents (20+ Claude Code terminals, OpenClaw instances, Codex agents) who need coordination, cost tracking, and governance.

**Value prop:** "Manage business goals, not pull requests." They position above the agent layer -- they don't build agents, they orchestrate whatever agents you bring.

**Key distinction from us:** Paperclip is agent-runtime-agnostic. They don't care if your agent is Claude Code, Codex, OpenClaw, a Python script, or an HTTP webhook. They provide the org chart, task system, and budget controls. They explicitly do NOT manage code artifacts, repos, deployments, or CI/CD.

---

## 2. Architecture

### Stack
- **Backend:** TypeScript + Hono (REST API)
- **Frontend:** React + Vite
- **Database:** PostgreSQL via Drizzle ORM
- **Embedded dev DB:** PGlite (embedded Postgres, zero-config local dev)
- **Auth:** Better Auth (session-based for humans, API keys for agents)
- **Monorepo:** pnpm workspaces with `server/`, `ui/`, `packages/db/`, `packages/shared/`, `packages/adapters/`, `cli/`

### Key architectural choices
- **Single unified REST API** serves both the UI and agents. Same endpoints, different auth levels.
- **Adapter pattern** for agent execution. 5 built-in adapters: `claude_local`, `codex_local`, `openclaw`, `process` (generic), `http` (webhooks).
- **Heartbeat-based execution.** Agents don't run continuously. They wake on schedule or events, do a cycle, exit. Session IDs persist across heartbeats for continuity.
- **Embedded PostgreSQL** for local dev (PGlite). External Postgres or Supabase for production. One codebase, progressive deployment.
- **Company-scoped everything.** Multi-company isolation in a single deployment. Every entity belongs to a company.

### Compared to zazigv2
- We use Supabase (hosted Postgres + edge functions + realtime). They use self-hosted Postgres with an embedded option.
- We have a daemon process managing slots and dispatching work. They have a lightweight scheduler in-process.
- We use Supabase Realtime for event propagation. They use SSE/polling with live event publishing.
- We have separate edge functions per operation. They have a single Express/Hono server.

---

## 3. Pipeline Design

### Paperclip's flow
```
Company Goal (Initiative)
  -> Projects
    -> Milestones
      -> Issues (tasks)
        -> Sub-issues
```

Work flows through an **org chart hierarchy**:
1. Human board creates company + goals
2. CEO agent proposes strategic breakdown (requires board approval)
3. CEO creates tasks, delegates to reports (CTO, CMO, etc.)
4. CTO breaks down into sub-tasks for engineers
5. Each agent wakes on heartbeat, checks assignments, picks highest priority
6. Agent checks out task atomically (single assignee, 409 on conflict)
7. Agent does work, updates status, posts comments
8. Manager agents review subordinates' work on their heartbeats

### Key difference from zazigv2
**Paperclip has NO automated pipeline.** There is no equivalent to our `feature -> breakdown -> code jobs -> combine -> verify -> merge` flow. Their "pipeline" is emergent from agent behavior -- the CEO agent decides strategy, delegates to CTO, CTO breaks down tasks, engineers pick them up. The structure comes from the org chart and agent prompts, not from an orchestrator.

**Our approach:** Deterministic pipeline stages with explicit state machines (created -> breakdown -> building -> combining -> verifying -> merging). The orchestrator cron drives transitions.

**Their approach:** Agent-driven delegation through an org chart. No hardcoded stages. The CEO can delegate however it wants. The system just tracks tasks and enforces atomic checkout.

This is a fundamentally different philosophy:
- **Us:** Pipeline-driven, deterministic, predictable stages
- **Them:** Agent-driven, emergent, flexible but unpredictable

---

## 4. Agent Roles

Paperclip doesn't hardcode agent roles. Roles are user-defined via the org chart:

**Default templates shipped:**
- **Default Agent** -- basic Claude Code/Codex loop with Paperclip skill
- **Default CEO** -- strategic planning, delegation, board communication

**User-defined roles (via org chart):**
- CEO, CTO, CMO, engineers, marketers, etc. -- whatever the user configures
- Each agent gets its own adapter config, prompt template, and heartbeat schedule
- Agents discover each other via the org chart and capabilities descriptions

**Agent coordination mechanism:** Task system + comments. No separate messaging. An agent delegates by creating a task assigned to another agent. Discussion happens in task comments. Cross-team work uses billing codes for cost attribution.

### Compared to zazigv2
- We have hardcoded role types (CPO, CTO, senior-engineer, junior-engineer, breakdown-specialist, verification-specialist, etc.) with role-specific prompts and MCP tool sets
- They have generic agents with user-configured roles via adapter config
- We route work based on role + complexity. They let agents self-organize through task assignment.
- Our agents are specialized and narrow. Theirs are general-purpose with role-specific prompts.

---

## 5. Model Strategy

**No model routing.** The model is configured per-agent in adapter config:

- Claude Code adapter: uses whatever model the Claude CLI uses, configurable via `model` field
- Codex adapter: uses OpenAI models, discovers available models via API
- OpenClaw adapter: whatever OpenClaw uses internally

There is no multi-model orchestration, no complexity-based routing, no fallback chains. Each agent is hardwired to one adapter/model. The human operator decides which agent gets which model.

### Compared to zazigv2
- We route between Codex and Claude Code based on job complexity and type
- We have model-aware slot management (separate `slots_claude_code` and `slots_codex`)
- Paperclip has none of this. Simpler but less efficient.

---

## 6. Deployment/Infra

**No CI/CD, no testing, no staging/production pipeline.**

This is by design. From their anti-requirements: "Does not manage work artifacts -- no repo management, no deployment, no file systems."

Paperclip explicitly does not:
- Manage git repos or branches
- Run CI/CD
- Handle deployments
- Do code review
- Manage test environments

The agents can do these things (an engineer agent could commit code, run tests, etc.) but Paperclip the system doesn't orchestrate it. It's all emergent from agent behavior.

### Compared to zazigv2
This is our biggest structural advantage. We have:
- Feature branching with `features.branch`
- Code job isolation per branch
- Combine phase (merging branches)
- Verification specialist for acceptance testing
- Deploy-to-test pipeline
- Merge to main flow

Paperclip has zero of this.

---

## 7. What They Do Better Than Us

### 7.1 Onboarding experience
`npx paperclipai onboard --yes` -- one command, zero config, embedded Postgres, everything runs locally. We require Supabase setup, daemon installation, MCP server config, etc. Their time-to-first-value is dramatically lower.

### 7.2 Agent-agnostic design
They genuinely don't care what agent you use. Claude, Codex, OpenClaw, a bash script, an HTTP webhook -- plug it in. Our system is tightly coupled to Claude Code and Codex. Adding a new agent runtime to zazigv2 is a major effort.

### 7.3 Visual UI with real-time updates
Full React dashboard: org chart, kanban task board, agent detail pages, cost dashboards, approval workflows, activity streams. All with live SSE updates. We have no UI -- everything is terminal-based or SQL Editor. They have a proper board operator experience.

### 7.4 Cost tracking and budget enforcement
First-class cost tracking per agent, per task, per project, per company. Monthly budgets with soft alerts at 80% and hard auto-pause at 100%. We track nothing. If an agent loops and burns $500 in tokens, we find out by checking Anthropic billing.

### 7.5 Company portability / templates
Export/import entire company configurations. The ClipHub marketplace vision (download a pre-built company -- marketing agency, dev shop, etc.) is compelling even if not built yet. Network effects from template sharing.

### 7.6 Governance and approval gates
Explicit board approval for agent hiring and CEO strategy. The human can pause/resume any agent, override any task, modify any budget -- from a real UI. Our approval flow is broken (Slack bugs documented in `docs/plans/2026-02-26-slack-approval-bugs.md`).

### 7.7 Session persistence across heartbeats
They save Claude Code session IDs and resume them on next heartbeat. This gives context continuity across agent cycles. Our agents start fresh each job (though feature branches carry code context).

### 7.8 Documentation quality
Exhaustive specs: SPEC.md (26k), SPEC-implementation.md (25k), PRODUCT.md, GOAL.md, DATABASE.md, DEVELOPING.md, agents-runtime.md, deployment modes, plans directory. All well-structured and internally consistent. Single developer producing this level of documentation is impressive.

---

## 8. What We Do Better

### 8.1 Deterministic pipeline
Our feature -> breakdown -> build -> combine -> verify -> merge pipeline is predictable and debuggable. When something breaks, you know exactly which stage failed. Their emergent agent-driven approach can produce unpredictable cascades (they even documented a self-wake cascade bug in `issue-run-orchestration-plan.md`).

### 8.2 Task decomposition
Our breakdown specialist takes a feature spec and produces structured code jobs with acceptance tests, complexity ratings, and dependency graphs. Their CEO/CTO agents decompose tasks however they want -- no structured breakdown, no guaranteed acceptance criteria, no dependency management.

### 8.3 Code artifact management
We track feature branches, manage code job isolation, combine branches, run verification. They explicitly don't manage code artifacts. For a software engineering platform, this matters enormously.

### 8.4 Multi-model routing
We route between Codex (simple tasks) and Claude Code (complex tasks) based on job complexity. They assign one model per agent and never switch. Our approach is more cost-efficient for mixed workloads.

### 8.5 Structured verification
We have a verification specialist that runs acceptance tests. They have no verification concept -- work is "done" when the agent says it's done. No independent verification.

### 8.6 Pipeline observability
Our pipeline snapshot gives a ~500 token summary of the entire system state. Their dashboard is richer visually but requires multiple API calls and doesn't have a cached snapshot equivalent.

### 8.7 Ideas inbox and triage
We have a structured intake funnel: ideas -> triage -> promote to feature/job. They have a flat task system with no upstream capture concept. Raw signals from Slack/terminal/monitoring get captured in our inbox; they have no equivalent.

### 8.8 Standalone dispatch for operational work
We can commission pipeline-technician, monitoring-agent, verification-specialist, project-architect jobs for operational maintenance. They have no concept of operational maintenance agents.

---

## 9. Steal List

### 9.1 Embedded Postgres for local dev (HIGH PRIORITY)
PGlite gives them zero-config local development. We could use this for local testing, demo instances, and developer onboarding. No Supabase dependency for trying the product.

### 9.2 Adapter pattern for agent runtimes (MEDIUM)
Their adapter interface is clean: `invoke(agent, context) -> result`, `status(run) -> status`, `cancel(run) -> void`. We should formalize our agent execution into a similar pluggable pattern, especially as we add more agent runtimes beyond Claude Code and Codex.

### 9.3 Cost tracking and budget enforcement (HIGH PRIORITY)
We need per-job, per-feature, per-agent cost tracking. Their `cost_events` table with agent/task/project/company attribution is a good reference design. The budget auto-pause at 100% is a safety feature we badly need.

### 9.4 Session resume across heartbeats (MEDIUM)
Storing Claude Code session IDs and resuming them on next agent invocation. We could use this for persistent agent instances that maintain context across jobs within the same feature.

### 9.5 Agent API keys with JWT (LOW)
They generate short-lived JWTs for local agent authentication. Our agents authenticate via Supabase service keys. JWT-scoped auth per agent per run is tighter.

### 9.6 Atomic task checkout with 409 conflict (ALREADY HAVE, VALIDATE)
Single-assignee atomic checkout via SQL `WHERE status IN (?) AND assignee IS NULL`. We have similar semantics in our job dispatch but should validate our conflict handling is as clean.

### 9.7 Issue execution lock (MEDIUM)
Their `issue-run-orchestration-plan.md` describes per-issue execution locks to prevent multiple agents working the same issue simultaneously. We have similar challenges with feature-level concurrency -- worth studying their deferred wake + promotion pattern.

### 9.8 Company portability format (LOW, FUTURE)
`paperclip.manifest.json` + markdown with frontmatter as a portable company config format. Useful for template sharing if we ever build a marketplace.

### 9.9 Heartbeat coalescing (MEDIUM)
When multiple wake requests arrive for the same agent+task, they coalesce into a single run instead of spawning duplicates. We should evaluate if our dispatch has similar deduplication.

### 9.10 Skills injection via --add-dir (ALREADY DO THIS)
They symlink skills into a temp `.claude/skills/` directory and pass `--add-dir` to Claude CLI. We do something similar with our workspace setup. Good to confirm our approach is aligned.

---

## 10. Weaknesses and Gaps

### 10.1 No code pipeline
The elephant in the room. For a software engineering use case, having no concept of branches, PRs, CI, testing, or deployment is a serious limitation. Agents can do these things ad hoc, but there's no structure to prevent conflicts, no branch isolation, no merge strategy. Two engineer agents could be editing the same file simultaneously with no conflict detection.

### 10.2 Emergent behavior is unpredictable
Agent-driven task decomposition means the CEO might produce a terrible strategy, the CTO might break tasks down wrong, and there's no structured feedback loop. The quality of the output depends entirely on prompt engineering and model capability. Our deterministic pipeline guarantees structural correctness even if individual jobs fail.

### 10.3 Single developer risk
340 commits from one person. No other contributors. This is a bus-factor-1 project. The documentation is excellent but the codebase has no external validation.

### 10.4 No structured testing or verification
"Done" means the agent said it's done. No acceptance tests, no verification specialist, no independent review. For any production use case, this is a major gap.

### 10.5 Heartbeat-only execution model
Agents run in short bursts (heartbeats) then exit. For complex multi-step engineering tasks that need sustained context, this is limiting. Session resume helps but adds complexity and fragility (they have bugs around session state -- `isClaudeUnknownSessionError` fallback handling).

### 10.6 No real-time inter-agent communication
All communication is async via task comments. Agent A creates a comment, Agent B sees it on their next heartbeat. No real-time coordination. For engineering tasks that require tight coordination (e.g., "I changed the API, update your client"), this introduces latency.

### 10.7 ClipHub is vaporware
The company template marketplace is listed as "COMING SOON" with a detailed 13k-word spec but no implementation. It's the steak sizzle of the product but doesn't exist yet.

### 10.8 Immature observability
71k-line heartbeat.ts service file suggests complexity is accumulating without adequate decomposition. The run log store is file-based for local dev. No structured observability beyond the activity log.

### 10.9 No ideas/intake funnel
No concept of raw ideas, signal capture, or intake triage. Work starts when a human or agent creates a task. There's no upstream funnel for capturing and prioritizing raw product signals.

### 10.10 Budget enforcement is reactive, not predictive
They auto-pause at 100% budget. No forecasting, no burn rate projection, no "at this rate you'll hit your limit in 2 hours" warning. Pure threshold-based.

---

## Summary Assessment

**Paperclip is a credible competitor but playing a different game.** They're building a general-purpose AI company orchestrator. We're building a software engineering pipeline. The overlap is in the control plane -- both manage agents, tasks, and coordination. But the execution model is fundamentally different.

**Their strengths** are in developer experience (one-command setup, great UI, comprehensive docs), agent flexibility (bring any runtime), and business operations (cost tracking, budgets, governance).

**Their weakness** is in the actual engineering pipeline. They have no concept of code artifacts, branches, testing, or deployment. For building software autonomously, this is the hard part -- and they've explicitly punted on it.

**Threat level: MEDIUM.** They could add code pipeline features. Their adapter pattern makes it possible to wrap our-style pipeline logic into Paperclip. But today, for the specific problem of autonomous software engineering, we're ahead on the hard stuff (code isolation, verification, merge flow) and they're ahead on the easy stuff (UI, onboarding, cost tracking).

**Priority actions:**
1. Steal their cost tracking design -- we need this yesterday
2. Study their embedded Postgres approach for local dev/demo
3. Build a basic dashboard UI -- their visual advantage is significant
4. Fix our Slack approval bugs -- their governance is working, ours is broken
