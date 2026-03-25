# Persistent Agent Identity — Design Reconciliation

**Date:** 2026-03-08
**Original design:** `docs/plans/active/2026-02-24-persistent-agent-identity-design.md`
**Status:** Reconciliation against current codebase (March 2026)

---

## Summary

Unlike Triggers & Events (mostly not built), Persistent Agent Identity
is **substantially shipped**. The core chain — roles DB, prompt assembly,
workspace creation, skills distribution, MCP tool scoping, repo symlinks,
role-aware reports — all works end-to-end.

A few gaps remain, mostly around hardening and enforcement rather than
missing infrastructure.

---

## Subsystem Status

### SHIPPED

| Subsystem | Details |
|-----------|---------|
| **Prompt assembly** | 4-layer stack (personality → role → skills → task → completion) assembled by orchestrator, written to `jobs.prompt_stack` |
| **handlePersistentJob** | Role-agnostic executor method. Stable workspace at `~/.zazigv2/{company-id}-{role}-workspace` |
| **Workspace setup** | `.mcp.json`, `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/`, `.claude/workspace-config.json` all written |
| **MCP tool scoping** | Role's `mcp_tools` array flows from DB → orchestrator → executor → `.mcp.json`. Agent only sees permitted tools |
| **Skills distribution** | `roles.skills` → orchestrator → executor → workspace `.claude/skills/{name}/SKILL.md` |
| **Edge functions** | `create-feature`, `update-feature` with status guards and event emission |
| **Roles table** | `prompt`, `skills`, `mcp_tools`, `interactive`, `default_model`, `slot_type`, `is_persistent` |
| **Role-aware reports** | Dynamic `.claude/{role}-report.md` path generation |
| **Context chain** | Orchestrator → StartJob message (`promptStackMinusSkills`) → executor → `CLAUDE.md` |
| **Hardcoded constants removed** | `CPO_MESSAGING_INSTRUCTIONS` deleted, everything in DB |

### SHIPPED DIFFERENTLY

| Subsystem | Design Intent | Actual Implementation |
|-----------|--------------|----------------------|
| **Agent identity** | Explicit session reuse logic | Deterministic workspace naming + tmux session naming = effective identity without session reuse code |
| **Memory/continuity** | Agent memory system | Workspace file preservation + napkin.md + auto-memory. No formal memory system but agents maintain their own state |
| **Repo symlinks** | All agents get repo access | Only persistent agents get symlinks (`workspace/repos/{project-name}` → worktree). Code-context jobs use worktrees directly |

### PARTIALLY SHIPPED (Gaps)

#### 1. Agent Version Enforcement
- `agent_versions` table exists (migration 125)
- `machines.agent_version` column exists
- **Gap:** No blocking logic in executor to prevent mismatched versions
- **Gap:** No auto-increment on deployment
- **Impact:** Version mismatch between daemon and DB-expected version won't be caught. Low risk currently (single operator) but needed for multi-machine deployments.

#### 2. Prompt Freshness Checking
- `.prompt-hash` and `.role` files written to workspace
- SessionStart hook scaffolded in settings.json
- **Gap:** `check-prompt-freshness.sh` script referenced but not found in repo
- **Impact:** Persistent agents won't detect when their role prompt changes in DB. Currently mitigated by daemon restart, but a latent bug for long-running sessions.

#### 3. Interactive TUI Mode
- `interactive?: boolean` field exists on StartJob message
- Executor has code path referencing ghostty UI
- **Gap:** Persistent agents launch headless (`-p` flag). TUI mode is scaffolded but not wired for CPO/CTO.
- **Impact:** Expert agents use interactive mode. CPO/CTO don't — they're terminal-attached via tmux.

### NOT BUILT

Nothing from the design is entirely missing. All core subsystems exist
in some form. The gaps above are enforcement/hardening, not missing
infrastructure.

---

## Remaining Work

Three items worth building, in priority order:

### 1. Prompt freshness validation (small)
Write the `check-prompt-freshness.sh` script that the SessionStart hook
already references. Compare `.prompt-hash` against current DB prompt hash.
If stale, log a warning or trigger a re-setup. Single file, no migrations.

### 2. Version enforcement (medium)
Add blocking logic to executor: before dispatching to a machine, check
`machines.agent_version` against minimum required version in
`agent_versions` table. Reject dispatch if mismatched. Add auto-increment
on `zazig promote`.

### 3. Liveness monitoring for persistent agents (medium)
Two ideas in inbox cover this:
- "Persistent agent tmux sessions have no liveness monitoring"
- "Persistent agent spawn has no post-spawn verification"

The daemon should `tmux has-session` periodically and auto-respawn dead
persistent agents. This completes the identity loop — agent is not just
created reliably, it stays alive reliably.

---

## Relation to Failed Feature

The `Persistent Agent Identity` feature (991a062c) failed in the pipeline.
Unlike Triggers & Events, the work was mostly done — just shipped
organically across many features rather than as a single unit.

**Recommendation:** Mark the original feature as `complete` (substantially
shipped). Create individual features for the three remaining gaps above
if/when they become priorities.
