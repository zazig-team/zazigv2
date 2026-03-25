# OpenAI Symphony -- Competitor Recon

**Date:** 2026-03-05
**Repo:** https://github.com/openai/symphony
**Analyst:** CPO (tom-cpo)
**Urgency:** High -- this is OpenAI entering our space directly

---

## TL;DR

Symphony is **not a full competitor to zazigv2**. It is a narrower, more focused tool: an autonomous issue-to-PR runner that polls Linear, spawns isolated Codex sessions per ticket, and shepherds work through a Linear-based status pipeline. It does NOT have multi-agent coordination, task decomposition, role-based specialisation, ideas management, product strategy, or executive agent layers. It is closer to what our *orchestrator cron + senior-engineer agent* does, but packaged as a standalone open-source product.

**Threat level: Medium.** Not an existential threat to zazigv2's full vision, but a serious credibility signal. OpenAI is validating the autonomous software engineering space with their own tool, and their execution quality is high. The SPEC.md alone is a masterclass in writing a portable service specification. Our moat is breadth (full pipeline from idea to deployment with exec agents), not depth on the individual coding loop.

---

## 1. What They Do

**Core product:** A long-running daemon that polls Linear for tickets in active states, creates isolated filesystem workspaces per issue, launches Codex (OpenAI's coding agent) in app-server mode inside each workspace, and manages the full lifecycle: dispatch, retry, reconciliation, stall detection, and workspace cleanup.

**Target user:** Engineering teams already using Linear + Codex who want to automate the ticket-to-PR loop. Teams that have adopted OpenAI's "harness engineering" philosophy (codebases instrumented for agent consumption).

**Value prop:** "Manage work, not agents." Engineers create Linear tickets, Symphony picks them up and delivers PRs with proof of work (CI status, review feedback, walkthrough videos). Engineers review and approve; they don't supervise.

**What it is NOT:**
- Not a multi-agent orchestration platform
- Not an ideas-to-deployment pipeline
- Not a product management tool
- Not a multi-model routing system
- Not a deployment/CI system

---

## 2. Architecture

### Components

| Component | Description |
|-----------|-------------|
| **Orchestrator** | GenServer (Elixir/OTP). Owns poll loop, in-memory state, dispatch, retries, reconciliation. Single authority for all scheduling mutations. |
| **Agent Runner** | Creates workspace, builds prompt from template, launches Codex app-server, streams events back to orchestrator. |
| **Codex AppServer Client** | JSON-RPC 2.0 client over stdio. Manages session lifecycle (initialize -> thread/start -> turn/start -> stream -> turn/completed). |
| **Workspace Manager** | Per-issue filesystem isolation. Lifecycle hooks (after_create, before_run, after_run, before_remove). Safety invariants (path validation, symlink escape prevention). |
| **Workflow Loader** | Reads WORKFLOW.md (YAML front matter + Liquid template body). Hot-reloads on file changes. |
| **Config Layer** | Typed getters with NimbleOptions schema. Environment variable resolution. Runtime re-application without restart. |
| **Linear Client** | GraphQL adapter. Candidate polling, state refresh, pagination. |
| **Status Dashboard** | Terminal TUI (ANSI) + Phoenix LiveView web dashboard. Token accounting, throughput graphs, session status. |
| **Dynamic Tool Server** | Serves `linear_graphql` tool to Codex sessions so agents can read/write Linear tickets directly. |

### Key Design Decisions

1. **In-memory only, no database.** All orchestrator state lives in a GenServer. Recovery is tracker-driven + filesystem-driven. No Postgres, no Supabase, no persistent state store.

2. **Single WORKFLOW.md as the entire configuration.** Everything -- prompt, config, hooks, tracker settings, concurrency limits -- lives in one version-controlled markdown file with YAML front matter.

3. **Elixir/OTP for process supervision.** Erlang's supervision trees handle process lifecycle, monitoring, and fault recovery. This is genuinely well-suited for the problem.

4. **Codex app-server protocol over stdio.** Not HTTP, not WebSocket. Direct subprocess management with JSON-RPC lines on stdout.

5. **Issue tracker as the source of truth.** Symphony reads from Linear; it does not maintain its own work queue. The orchestrator's job is to reflect Linear state, not replace it.

---

## 3. Pipeline Design

### Symphony's Pipeline

```
Linear Ticket (Todo)
  -> Orchestrator polls, claims issue
  -> Workspace created (git clone via hook)
  -> Codex app-server launched in workspace
  -> Agent works: reads ticket, plans, implements, tests, creates PR
  -> Agent moves ticket to Human Review
  -> Human reviews PR
  -> Human moves ticket to Merging
  -> Agent runs "land" skill (squash-merge)
  -> Ticket moves to Done
  -> Workspace cleaned up
```

### Zazigv2's Pipeline

```
Idea (inbox)
  -> CPO triages, promotes to feature
  -> CPO writes spec (spec, acceptance_tests, human_checklist)
  -> Feature set to ready_for_breakdown
  -> Breakdown Specialist decomposes into jobs
  -> Jobs dispatched to senior/junior engineers
  -> Code jobs execute (Claude Code / Codex)
  -> Combiner merges job branches
  -> Verifier runs acceptance tests
  -> Deploy to test server
  -> Human verification
  -> Merge to main
  -> Deploy to production
```

### Comparison

| Dimension | Symphony | Zazigv2 |
|-----------|----------|---------|
| **Input** | Linear ticket (human-written) | Ideas inbox, CPO-specced features |
| **Decomposition** | None. One agent per ticket. | Breakdown Specialist splits features into jobs |
| **Parallelism** | Multiple tickets in parallel (up to 10 concurrent agents) | Multiple jobs per feature, multiple features |
| **Agent per task** | One Codex session = one ticket | One agent per job, specialised roles |
| **State machine** | Linear ticket states drive lifecycle | DB-driven feature/job status columns |
| **Branch strategy** | One branch per ticket | One branch per job, combiner merges to feature branch |
| **Code review** | Agent creates PR, human reviews | Combiner + verifier automated, then human review |
| **Merge** | Agent squash-merges via "land" skill | Automated merge after verification passes |

**Key difference:** Symphony treats each ticket as an atomic unit of work. One agent, one ticket, one PR. Zazigv2 decomposes features into multiple parallel jobs, combines them, and verifies the result. Symphony is simpler but can't handle complex multi-file features that benefit from decomposition.

---

## 4. Agent Roles

### Symphony: One Role

Symphony has exactly **one agent type**: a Codex session running the WORKFLOW.md prompt. There is no role specialisation, no multi-agent coordination, no exec agents.

The agent is expected to:
- Read the ticket and plan
- Implement the code
- Run tests
- Create a PR
- Handle review feedback (rework flow)
- Merge the PR (land skill)

All orchestration intelligence lives in the WORKFLOW.md prompt, not in the system architecture.

### Zazigv2: Many Roles

- **CPO** -- product strategy, specs, triage
- **CTO** -- architecture, code review
- **Breakdown Specialist** -- feature decomposition
- **Senior Engineer** -- complex code jobs
- **Junior Engineer** -- simple code jobs
- **Combiner** -- branch merging
- **Verifier** -- acceptance testing
- **Pipeline Technician** -- DB-level fixes
- **Monitoring Agent** -- health checks
- **Project Architect** -- system design

---

## 5. Model Strategy

### Symphony

- **Single model: Codex (gpt-5.3-codex)** in their own WORKFLOW.md config
- Default command: `codex app-server`
- Model is configurable via the `codex.command` field
- No multi-model routing, no model selection logic
- All reasoning at `xhigh` effort in their reference config
- Token accounting is detailed (input/output/total tracking, rate limit awareness)

### Zazigv2

- **Multi-model:** Claude (Claude Code CLI) + Codex (codex-delegate)
- Role-based routing: complex work to Claude, simpler tasks delegated to Codex
- Slot-based capacity management per model type
- Different models for different job complexities

**Our advantage here is real.** Multi-model gives us flexibility, cost optimization, and resilience. Symphony is locked to Codex.

---

## 6. Deployment / Infra

### Symphony

- **No deployment pipeline.** Symphony creates PRs. Deployment is your problem.
- No CI/CD integration beyond watching PR check status
- No staging/production concept
- No test server deployment
- Runs as a local daemon (no cloud hosting, no Supabase, no edge functions)
- Elixir release binary, run with `./bin/symphony`

### Zazigv2

- Full deployment pipeline: feature branch -> combine -> verify -> deploy to test -> human verify -> merge to main -> deploy to production
- Supabase backend (Postgres + Edge Functions + Realtime)
- Daemon manages local machine slots
- Vercel deployment integration
- Staging/production split

**Symphony stops at "here's a PR." We go all the way to production.**

---

## 7. What They Do Better Than Us

Being honest:

1. **SPEC.md is extraordinary.** 77KB of meticulous, language-agnostic specification. Every edge case documented. Every error category named. Every timeout defined. This is how you write a portable spec. Our pipeline design doc is good but nowhere near this level of rigour.

2. **Hot-reload everything.** WORKFLOW.md changes are picked up live without restart. Config, prompts, concurrency limits, hooks -- all dynamically reloaded. Our orchestrator requires redeployment for most config changes.

3. **Workspace isolation is bulletproof.** Symlink escape prevention, path validation, per-issue directories, lifecycle hooks. Our git worktree approach works but their safety invariants are more explicitly designed.

4. **Stall detection.** They track last Codex activity timestamp and kill stalled agents after configurable timeout. We had the zombie job problem for weeks before building similar protections. Their version was designed in from day one.

5. **Retry with exponential backoff.** Clean separation between continuation retries (1s, agent finished but ticket still active) and failure retries (exponential backoff up to 5min). Our retry logic is less sophisticated.

6. **WORKFLOW.md as single source of truth.** Brilliant simplicity. Everything in one file, version-controlled with the repo. No DB config, no env vars sprawl (though env vars are supported). Teams can fork the workflow and customise without touching Symphony code.

7. **Multi-turn continuation.** Agent finishes a turn, Symphony checks if the ticket is still active, and starts another turn on the same thread. Up to 20 turns per session. Our agents run once per job dispatch.

8. **Token accounting.** Detailed per-session and aggregate token tracking with throughput graphs and rate limit monitoring. We track nothing about token usage currently.

9. **The "land" skill is polished.** 10KB skill file with conflict resolution, CI monitoring, squash-merge loop, review comment handling. Purpose-built for the merge endgame.

10. **Open source with a "build your own" pitch.** The SPEC is designed to be implemented in any language. This is a platform play, not just a product.

---

## 8. What We Do Better

1. **Full pipeline from idea to production.** Symphony handles ticket-to-PR. We handle idea-to-deployment. That's a fundamentally larger scope and more valuable to a team.

2. **Task decomposition.** Complex features get broken into parallel jobs by a specialist agent. Symphony can only throw one agent at one ticket. For large features, our approach is categorically better.

3. **Multi-model routing.** Claude + Codex, routed by complexity and role. Symphony is Codex-only.

4. **Executive agents.** CPO for product strategy, CTO for architecture. Symphony has no concept of product management or strategic decision-making.

5. **Persistent state.** Supabase backend means we survive restarts, can do historical analysis, and coordinate across machines. Symphony is in-memory only -- restart means starting from scratch (though tracker-driven recovery mitigates this).

6. **Ideas inbox and triage.** We capture signals from multiple sources and process them through a structured pipeline. Symphony starts at "someone already wrote a Linear ticket."

7. **Verification pipeline.** Automated acceptance testing, deploy to test server, human checklist verification. Symphony's quality gate is "PR checks pass and human approves." Ours is more rigorous.

8. **Multi-machine coordination.** Our daemon + slots system coordinates work across machines. Symphony runs on one machine.

9. **Branch strategy for complex features.** Job branches -> feature branch -> main. Symphony does one branch per ticket with no composition capability.

10. **Contractor dispatch.** We can commission operational work (pipeline-technician, verification-specialist) through the same pipeline. Symphony only does code work.

---

## 9. Steal List

### P0 -- Steal Immediately

1. **WORKFLOW.md pattern for repo-level agent config.** One file, YAML front matter + prompt body, version-controlled. We should adopt a similar pattern for our per-repo agent configuration instead of scattering config across DB, env vars, and CLAUDE.md files.

2. **Hot-reload for orchestrator config.** Watch the config file, re-apply without restart. Our orchestrator should pick up config changes without redeployment.

3. **Token accounting and throughput dashboard.** We track zero token usage. This is a gap. Add per-job and aggregate token tracking, rate limit monitoring, cost estimation.

4. **Stall detection with last-activity timestamp.** We built zombie protection reactively. Formalise it: track last agent activity timestamp per job, auto-kill after configurable timeout.

5. **Multi-turn continuation within a session.** After a job completes, check if more work is needed and re-engage the same agent session. Saves context window and reduces cold-start overhead.

### P1 -- Steal Soon

6. **Workspace lifecycle hooks.** `after_create`, `before_run`, `after_run`, `before_remove` -- configurable shell scripts for workspace setup/teardown. Our worktree management could benefit from similar extensibility.

7. **Per-state concurrency limits.** `max_concurrent_agents_by_state` -- limit how many agents can be in "Merging" state simultaneously. Useful for controlling merge contention.

8. **Continuation vs failure retry distinction.** Short delay (1s) for "agent finished but work remains" vs exponential backoff for actual failures. Our retry logic should be this nuanced.

9. **Explicit error category taxonomy.** Symphony names every error category. `codex_not_found`, `invalid_workspace_cwd`, `response_timeout`, etc. Makes debugging much cleaner than our current approach.

10. **Dynamic tool injection via app-server protocol.** Symphony serves `linear_graphql` as a client-side tool during Codex sessions. We could inject pipeline-aware tools into agent sessions the same way.

### P2 -- Consider

11. **Spec-first, implementation-second.** Write a portable spec, then implement. Good discipline for making our system portable or forkable.

12. **Phoenix LiveView dashboard.** Real-time web dashboard for observability. We have pipeline snapshot but no live UI.

---

## 10. Threat Assessment

### Market Position

Symphony targets **engineering teams that already use Linear and want to automate ticket execution**. It is a "last mile" automation tool, not a full autonomous software engineering platform.

### How Serious Is This?

**Medium threat. Here's why:**

**The bad:**
- OpenAI is validating our space. When OpenAI ships a tool in your category, VCs and customers pay attention.
- The SPEC quality is exceptional. This will attract contributors and implementations in every language.
- The "build your own from the spec" pitch means Symphony becomes a *protocol*, not just a product. That's much harder to compete with.
- Codex integration is obviously first-class and will get better as Codex improves.
- Open source (Apache 2.0) makes it zero-cost to adopt.

**The not-so-bad:**
- It launched yesterday (2026-03-04). 2 commits. This is an engineering preview, not a product.
- No task decomposition means it can't handle complex features. One agent per ticket is a hard ceiling.
- Linear-only tracker integration. No Jira, no GitHub Issues, no custom trackers.
- Codex-only model support. If Claude is better for your codebase, tough luck.
- No deployment pipeline. No ideas management. No exec agents. No multi-machine support.
- In-memory only means it's a single-machine, single-process tool.

### Defensible Position

Our moat is **pipeline breadth and multi-agent coordination**:

1. **Ideas to production** vs ticket to PR
2. **Task decomposition** vs monolithic agent
3. **Multi-model** vs Codex-only
4. **Persistent state** vs in-memory
5. **Exec agents** vs code-only
6. **Multi-machine** vs single-process

The risk is not that Symphony replaces us. The risk is that Symphony becomes the baseline expectation for "what autonomous coding looks like," and teams adopt it first because it's free and from OpenAI. Then they build on top of it instead of switching to a more complete platform like ours.

**Counter-strategy:** Ship faster on the pipeline breadth story. Make the idea-to-production narrative undeniable. Symphony handles the coding loop; we handle the entire engineering organisation.

---

## 11. Weaknesses / Gaps in Symphony

1. **No task decomposition.** The biggest gap. Complex features that need multiple coordinated changes across files/services can't be parallelised. One agent, one ticket, pray it figures it out.

2. **Linear-only.** The tracker adapter pattern supports extension, but only Linear is implemented. Most teams use Jira, GitHub Issues, or internal tools.

3. **No persistent state.** Restart = lose all in-memory state. Token accounting, retry counts, completed set -- all gone. Tracker-driven recovery helps but you lose operational history.

4. **No deployment integration.** PR creation is the endpoint. No staging, no testing environment, no production deploy.

5. **Single machine.** No distributed coordination. If your machine goes down, Symphony stops.

6. **No quality verification beyond PR checks.** No automated acceptance testing, no deploy-to-test, no visual regression. "CI passes" is the quality bar.

7. **Codex lock-in.** If Claude, Gemini, or another model is better for a task, you can't use it. The app-server protocol is Codex-specific.

8. **No product layer.** No roadmap, no prioritisation beyond Linear's own priority field, no strategic decision-making, no ideation. You need humans to write and prioritise every ticket.

9. **WORKFLOW.md can become a monster.** Their reference WORKFLOW.md is already 327 lines of detailed instructions. As teams add more rules, this file will become unwieldy. No modularity, no skill composition beyond Codex skills.

10. **No multi-repo coordination.** Each Symphony instance is one repo, one project. Cross-repo features are not supported.

11. **Rework = start from scratch.** Their rework flow creates a new branch from main and starts over entirely. No incremental fix capability. This will burn tokens on large tickets.

---

## Summary Verdict

Symphony is a well-engineered, narrowly-scoped tool that solves one part of what zazigv2 solves. It is not a direct competitor to our full vision -- it competes with our orchestrator + senior-engineer layer specifically.

The threat is **market narrative**, not **product capability**. When OpenAI ships something in your space, people notice. Our response should be:

1. **Ship the breadth story hard.** Idea to production. No one else does this.
2. **Steal the good patterns** (token accounting, hot-reload, stall detection, continuation turns).
3. **Don't panic.** Symphony validates our thesis that autonomous software engineering is a real category. That's good for us.
4. **Watch the contributor ecosystem.** If people start implementing Symphony in TypeScript/Python/Go and it becomes a de facto protocol, that changes the threat level significantly.
