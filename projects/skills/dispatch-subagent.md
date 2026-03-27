# /dispatch-subagent

**Role:** CPO
**Type:** Operational — delegates focused investigations to a configured sub-agent
**Usage:** `/dispatch-subagent <role> <task>`

Run this when you want to delegate a scoped task to a specialized sub-agent while keeping CPO context small.

---

## What This Skill Does

When the CPO invokes `/dispatch-subagent`, this skill:
1. Reads `.claude/subagents.json` and loads available roles from the `roles` key
2. Validates that the requested `<role>` exists
3. Resolves all company repos using MCP `query_projects`
4. Syncs local repos in `~/.zazigv2/repos/{project-name}/` via `git clone` (missing) or `git pull` (existing)
5. Builds a combined prompt from:
   - the selected role's `prompt`
   - the resolved local repo path list
   - the user-provided `<task>`
6. Spawns an Agent tool call using the role's `subagent_type` and `model`
7. Returns the sub-agent's findings to the CPO conversation

---

## Phase 1: Parse Inputs and Load Roles

1. Parse command arguments as:
   - `<role>`: required, role key/name to dispatch
   - `<task>`: required, free-form task description
2. If either is missing, stop and return:
   - `Usage: /dispatch-subagent <role> <task>`
3. Read `.claude/subagents.json`.
4. Extract `roles` and confirm it is present and non-empty.

If the config file is unreadable or malformed, stop and report the exact parse/read error.

---

## Phase 2: Validate Role

1. Look up the requested `<role>` inside `roles`.
2. Require the selected role to provide:
   - `prompt`
   - `subagent_type`
   - `model`

If role is not found:
- Report: `Role '{role}' not found.`
- Show available role names from `roles`
- Stop immediately

---

## Phase 3: Resolve and Sync Repositories

1. Call MCP `query_projects` to fetch all company projects (including name + remote URL).
2. For each project:
   - Compute local path: `~/.zazigv2/repos/{project-name}/`
   - If local repo does not exist:
     - Run `git clone {remote_url} ~/.zazigv2/repos/{project-name}/`
   - If local repo exists:
     - Run `git -C ~/.zazigv2/repos/{project-name}/ pull`
3. Track successful local paths and failures separately.

Error handling:
- If `query_projects` fails: report the MCP error clearly and stop.
- If clone/pull fails for a specific repo: warn, skip that repo, and continue.

Only include successfully synced repos in downstream prompt context.

---

## Phase 4: Build Dispatch Prompt

Build one combined prompt in this order:
1. Role base prompt from `roles[{role}].prompt`
2. A section listing local repo paths that synced successfully
3. The CPO-provided `<task>` text

Recommended structure:

```text
{role_prompt}

Available local repositories:
- /Users/.../repo-a
- /Users/.../repo-b

Task:
{task}
```

If zero repos synced successfully, continue anyway and explicitly note in the prompt that no local repos were available.

---

## Phase 5: Spawn Sub-Agent and Return Findings

1. Spawn Agent tool call with:
   - `agent_type`: value from role `subagent_type`
   - model override: value from role `model` (if the Agent tool supports model selection in this runtime)
   - message/prompt: combined prompt from Phase 4
2. Wait for sub-agent completion.
3. Return sub-agent findings directly to the CPO conversation in concise, actionable form.

If the Agent spawn or execution fails, return the failure reason clearly and include which role/task was attempted.

---

## Notes

- Sub-agents run with their own context window, so CPO context does not bloat.
- No pipeline artifacts are created (no jobs, no features, no DB writes).
- This is a local, ephemeral investigation utility.
- The CPO must have Agent tool permission enabled for this to function.

---

## Rules

- Validate role before any project sync work.
- Stop on role-not-found and `query_projects` failure.
- Continue on per-repo clone/pull failures (warn and skip).
- Never fabricate role config, projects, repo paths, or sub-agent output.
- Always surface what was skipped and why.
