---
name: dispatch-subagent
description: |
  Dispatches a local Claude sub-agent to investigate company codebases.
  Use when the CPO needs codebase intelligence: architecture questions, code search,
  pattern discovery, or implementation details across any company repo.
  Trigger: `/dispatch-subagent <role> <task>`
user_invocable: true
---

# Dispatch Sub-Agent

Dispatch a read-only Claude sub-agent to investigate company codebases and return findings.

## When to Use

- CPO needs codebase intelligence before making a product or architecture decision
- Investigating how a feature is currently implemented across repos
- Searching for patterns, APIs, or conventions in the codebase
- Answering "how does X work?" questions about the code without interrupting engineers

## Trigger Pattern

```
/dispatch-subagent <role> <task>
```

- `<role>`: the sub-agent role key (e.g. `code-investigator`) — must exist in `.claude/subagents.json`
- `<task>`: the investigation task, written as a clear question or directive

**Example:**
```
/dispatch-subagent code-investigator How does the job dispatching pipeline work? Trace from job creation to agent execution.
```

## Sub-Agent Config Format

The skill reads role config from `.claude/subagents.json` in the workspace. Expected format:

```json
{
  "code-investigator": {
    "subagent_type": "Explore",
    "model": "claude-sonnet-4-6",
    "description": "Read-only codebase explorer for deep code investigation"
  }
}
```

Each key is a role name. Each value must have:
- `subagent_type` — Agent tool `subagent_type` value (e.g. `Explore`, `general-purpose`)
- `model` — Claude model ID to use (e.g. `claude-sonnet-4-6`)
- `description` — Human-readable description (optional, informational)

## Execution Steps

### Step 1: Load Sub-Agent Config

Read `.claude/subagents.json` from the workspace root. Parse the JSON.

**If the file is missing:**
> Error: `.claude/subagents.json` not found. Create it with at least one role entry before using `/dispatch-subagent`. See the SKILL.md for the expected format.

**If the file is malformed (invalid JSON):**
> Error: `.claude/subagents.json` contains invalid JSON. Fix the syntax and retry.

Stop in both cases — do not proceed.

### Step 2: Validate Role

Check that `<role>` exists as a key in the parsed config.

**If the role is not found:**
> Error: Role `<role>` not found in `.claude/subagents.json`.
> Available roles: `role-a`, `role-b`, ...

List available roles from the config keys. Stop — do not create any pipeline artifacts.

### Step 3: Resolve Repos

Call `query_projects` MCP tool to get all company projects.

For each project that has a repo URL:
1. Compute the local path: `~/.zazigv2/repos/{project-name}/`
2. If the path **exists**: run `git -C ~/.zazigv2/repos/{project-name}/ pull` to freshen it
3. If the path **does not exist**: run `git clone <repo_url> ~/.zazigv2/repos/{project-name}/`
4. On success: add the resolved path to a collection of available repos

**On clone/pull error or missing URL:** Log the error (e.g. `Skipping project {name}: clone failed`) but continue processing other projects.

**If zero repos were successfully resolved:**
> Error: No repos could be resolved. Check that projects have repo URLs and that git credentials are available.

Stop if zero repos resolved.

### Step 4: Build Prompt

Construct the sub-agent prompt:

```
You are a read-only codebase investigator. You have access to these repositories:
{resolved repo paths, one per line}

Task: {task}

Investigate the codebase and return your findings clearly. Do not create files or make changes.
```

### Step 5: Spawn Sub-Agent

Use the Agent tool with the following parameters from the config for the matched role:

- `subagent_type`: from config (e.g. `Explore`)
- `model`: from config (e.g. `claude-sonnet-4-6`)
- `prompt`: the prompt built in Step 4

Wait for the sub-agent to complete before proceeding.

**Do NOT use Bash to launch the sub-agent.** The Agent tool is required.

### Step 6: Return Results

Present the sub-agent's findings directly in the conversation. Format as:

```
## Sub-Agent Findings

**Role:** {role}
**Repos searched:** {count} ({list of project names})

---

{sub-agent output verbatim}
```

Do not create jobs, features, ideas, or any other pipeline artifacts. This skill is read-only and returns findings to the CPO for their own reasoning.

## Important Constraints

- **No pipeline artifacts** — never create jobs, features, ideas, or Slack messages as a result of this skill
- **Agent tool only** — always use the Agent tool to spawn the sub-agent, never Bash
- **Read-only** — the sub-agent prompt explicitly instructs the agent not to modify files
- **Fail clearly** — all errors must be specific and actionable so the CPO knows exactly what to fix
