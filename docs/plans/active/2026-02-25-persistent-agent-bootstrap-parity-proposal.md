# Persistent Agent Bootstrap Parity

## Problem

**Today:** When the zazigv2 daemon spawns persistent agents (CPO, CTO, etc.), it uses a separate code path (`discoverAndSpawnPersistentAgents` → `handlePersistentJob`) that bypasses half the prompt injection pipeline. The regular orchestrator dispatch path (`handleStartJob`) correctly assembles all four context layers — personality, role, skills, and task — but the persistent path only delivers Layers 1-2 (personality + role prompt via CLAUDE.md). Skills are fetched from the edge function but silently dropped. The sub-agent personality prompt is never fetched. There is no Layer 4 kickoff task. The agent boots, reads its persona, and sits idle.

**Which is a problem, because:** Persistent agents are the exec team — they need to be the most capable, best-equipped agents in the system. Instead, they launch with less context than a one-off card worker. Concretely:
- Skills (standup, cardify, review-plan) are never copied to the workspace, so they only work if globally installed — which is incidental, not by design
- Sub-agent personality forwarding is missing, so any Task-tool spawns lose the exec's voice and constraints
- There is no boot task, so the agent cannot self-orient on startup (check for pending work, review state, run standup)
- The hardcoded `msg.role === "cpo"` routing check means only CPO can be persistent — adding CTO or any other persistent role would silently fail

**What if?:** Persistent agents boot with full prompt injection parity — same four layers as any dispatched job — plus a self-orientation mechanism that lets them pick up where they left off across session restarts. The daemon treats persistence as a property of the role, not a hardcoded name check.

## Hypothesis

The persistent agent path was built as a quick bootstrap to get long-lived sessions running, and the gaps are simply incomplete wiring — not architectural mismatches. The infrastructure to deliver skills, sub-agent prompts, and task context already exists in the regular dispatch path and the edge function. Closing the gap is a matter of passing through what's already fetched and adding a boot-task injection.

## Therefore

Bring `handlePersistentJob` to full parity with `handleStartJob` by wiring through the three dropped context layers and adding a generic `is_persistent` routing check.

## How this would work

### 1. Edge function: `company-persistent-jobs`

Add `compiled_sub_agent_prompt` to the query and response payload:

```
Current response: { role, prompt_stack, skills, model, slot_type }
New response:     { role, prompt_stack, sub_agent_prompt, skills, model, slot_type }
```

The `prompt_stack` assembly already works correctly (personality + role with separator). No changes needed there.

### 2. Executor: `handlePersistentJob()`

Three additions to the `setupJobWorkspace()` call:

| Parameter | Current | Proposed |
|-----------|---------|----------|
| `skills` | not passed | `msg.skills` (already on the StartJob) |
| `repoSkillsDir` | not passed | resolve from config (same as ephemeral path) |
| `subAgentPrompt` | not passed | `msg.subAgentPrompt` (new field from edge function) |

This is ~3 lines of code. `setupJobWorkspace` already handles all three when they're provided.

### 3. Executor: `spawnPersistentAgent()`

Map the new `sub_agent_prompt` field from the edge function response onto the synthetic StartJob message as `subAgentPrompt`.

### 4. Routing: replace hardcoded role check

In `handleStartJob()`, replace:
```typescript
if (msg.role === "cpo") return this.handlePersistentJob(msg);
```
With:
```typescript
if (msg.persistent) return this.handlePersistentJob(msg);
```

And have `spawnPersistentAgent()` set `persistent: true` on the synthetic StartJob. This allows any `is_persistent` role to route correctly.

### 5. Repo path injection

Agent workspaces are runtime state — not repos, not version-controlled. But agents produce artifacts (design docs, proposals) that must live in the zazigv2 repo. A symlink approach (`workspace/docs → repo/docs`) is fragile — any agent or skill that runs `mkdir -p docs/plans` before writing will create a real directory and silently break the link.

**Instead: inject the repo path into CLAUDE.md at workspace setup time.**

Add `repoRoot?: string` to `WorkspaceConfig`. In `setupJobWorkspace()`, if provided, append a `## Workspace Context` section to the CLAUDE.md content:

```markdown
## Workspace Context

This workspace is runtime state only. Your session report goes here.
All other documents (design docs, proposals, plans) go in the project repo:

Project repo: /path/to/zazigv2
Docs directory: /path/to/zazigv2/docs/plans
```

The daemon derives the repo root from its own location — `thisDir` resolves to `packages/local-agent/dist/`, so repo root is `join(thisDir, '..', '..')`. Pass `repoRoot` from both `handlePersistentJob()` and `handleStartJob()`.

**Why this is better than a symlink:**
- Cannot be broken by an agent creating directories
- Explicit — the agent knows it's writing to a repo, not a local path
- No filesystem tricks, no edge cases
- Machine-specific by construction (daemon writes it at spawn time, not from DB)
- Works for all agents on all machines automatically

### 6. Boot task injection (Layer 4 equivalent)

After the tmux session spawns, inject an initial orientation prompt via `tmux send-keys` (same mechanism already used for inbound messages, with the existing 15-second startup delay):

```
Read your state files. If .claude/cpo-report.md exists, review it for continuity.
Check for pending work via your MCP tools. Orient yourself and begin.
```

This prompt should be configurable per role — stored in the `roles` table as `boot_prompt` or assembled from a convention. For now, a sensible default hardcoded in `handlePersistentJob` is sufficient to unblock.

### 7. State file convention

Establish `.claude/{role}-report.md` as the cross-session continuity file. The role prompt (Layer 2) already mandates writing `cpo-report.md` at the end of every job. On boot, the Layer 4 prompt tells the agent to read it. This creates a self-sustaining orientation loop without any new infrastructure.

## Scope boundaries

- **In scope:** Wiring existing infrastructure through the persistent path, boot-task injection, routing fix, repo path injection
- **Out of scope:** New database tables, changes to `compile_personality_prompt()`, changes to the orchestrator dispatch flow, UI changes
- **Not changing:** The prompt stack assembly in the edge function (it already works), the workspace directory convention, the tmux session management

## We propose

Close the five gaps in `handlePersistentJob` by wiring through skills, sub-agent prompt, boot-task injection, and repo path injection that already exist (or are trivially derivable from) the regular dispatch path, and replace the hardcoded CPO routing check with a generic `is_persistent` flag. No new mechanisms — just completing the plumbing.
