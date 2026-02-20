---
name: new-exec
description: |
  Conversational skill that creates a new exec team member through dialogue.
  Scaffolds AGENT.md, HEARTBEAT.md, operating manual, state files, standup file,
  exec-registry entry, Trello labels, and directory structure.
  Use when adding a new AI executive to the Chainmaker team.
author: Tom Weaver
version: 2.0.0
date: 2026-02-16
---

# New Exec

Create a new Chainmaker exec team member through a step-by-step conversation.
Generates all config, system prompts, infrastructure files, and directory structure
so the only manual steps are creating the Slack app and adding tokens.

## When to Use

- Adding a new AI executive to the Chainmaker team
- Creating a project-scoped VP or lead (e.g., VP Product for Aida)
- Expanding the exec team with a new role

## Workflow

Walk through each step in order. Ask one question at a time. Don't skip steps.

### Step 1: Role Name

Ask the user for the role name. Examples:
- "CPO" (Chief Product Officer)
- "VP Product (Marginally)"
- "CoS" (Chief of Staff)
- "CMO" (Chief Marketing Officer)

### Step 2: Role ID

Suggest a kebab-case role_id based on the name. Confirm with the user.

Examples:
- "CPO" -> `cpo`
- "VP Product (Marginally)" -> `vp-product-marginally`
- "Chief of Staff" -> `cos`

### Step 3: Validate Uniqueness

Before proceeding, check if this exec already exists. Check all three sources:

1. **Exec registry**: Read `~/.local/share/trw-projects/exec-registry.json` and check if `role` matches
2. **Chainmaker registry**: Read `~/.chainmaker/registry.yaml` and check if `role_id` exists under `agents:`
3. **State files**: Check if `~/.local/share/trw-projects/{role_id}-state.json` exists

If found in any source, warn the user:

```
Warning: "{role_id}" already exists in:
- exec-registry.json (active: true)
- ~/.chainmaker/registry.yaml (enabled: false)
- State file: {role_id}-state.json

Options:
1. Continue anyway (will overwrite existing files)
2. Choose a different role ID
3. Cancel
```

If not found anywhere, confirm and proceed:
```
No existing exec found for "{role_id}" — safe to create.
```

### Step 4: Model

Ask which Claude model to use. Options:
- **sonnet** — recommended for most roles. Fast, capable, cost-effective.
- **opus** — for roles requiring deep reasoning (CPO, strategic roles).

Default recommendation: sonnet.

### Step 5: Heartbeat Frequency

Ask how often the heartbeat should run. Recommendations:
- **30m** — high-priority roles (CPO)
- **2h** — product/engineering roles (VP Product)
- **4h** — marketing, support, lower-urgency roles (CMO)

### Step 6: Authorized Users

Read `~/.chainmaker/registry.yaml` to discover existing authorized users. Display them:

```
Existing authorized users from registry:
- U0AF1P46T8A (used by: cpo, cmo)
```

Ask which users should be authorized for this agent. Tom (U0AF1P46T8A) should always be included. The user can add additional Slack user IDs.

### Step 7: Channels

Ask which Slack channels this agent should listen in. Can be empty for DM-only agents.

Show existing channels from the registry for reference:
```
Channels in use:
- C0AF2S8H4RG  # cpo-standup (cpo)
- C0AF6ELN936  # escalations (cpo)
- C0AF1P7TT5G  # exec-team (cpo, cmo)
```

The user can provide channel IDs or say "none" for DM-only.

### Step 8: Project Scope

Ask if this agent is scoped to a specific project. Examples:
- **Yes**: VP Product (Marginally) -> `~/Documents/GitHub/marginally`
- **No**: CPO, CMO (org-wide roles)

If project-scoped, ask for the project path (e.g., `~/Documents/GitHub/aida`).

### Step 9: Watched Labels

Ask which Trello labels this exec should watch for card routing. VP-Eng writes per-exec standups filtered by these labels.

Show existing label assignments from `exec-registry.json`:
```
Current label assignments:
- CPO: * (all labels — default)
- CTO: tech-review, cto
- CMO: marketing, cmo
```

Ask what labels this exec should watch. Examples:
- `["tech-review", "cto"]` — for technical roles
- `["marketing", "cmo"]` — for marketing roles
- `["design", "ux"]` — for design roles
- `["*"]` — watches all labels (only for CPO-level roles)

The role_id is always included as a watched label automatically (so the exec catches cards explicitly tagged for them).

### Step 10: Generate AGENT.md

Generate the AGENT.md system prompt. Match the style of existing agents — concise, direct, role-specific.

**Template structure** (adapt based on role type):

```markdown
# {Role Name}

You are the {role name} of Chainmaker, an autonomous startup run by Tom Weaver. You are a persistent AI executive with your own Slack identity (@{role_id}).

## Your Role
- {3-5 bullet points describing core responsibilities}
- {Tailor to the role type: product, marketing, engineering, ops, etc.}

## {Context Section}
{If project-scoped: describe the specific project and its context}
{If org-wide: list the portfolio of projects}

## Communication Style
- Be concise and direct — Tom reads on mobile
- Lead with the decision or action needed
- Use bullet points for lists
- Don't pad with pleasantries — get to the point
- If you need Tom's input, say exactly what you need decided

## Constraints
- Never make financial commitments
- Never communicate externally on behalf of the company
- Escalate security issues immediately
- When unsure, ask Tom rather than guess
{Add role-specific constraints as appropriate}
```

Show the generated AGENT.md to the user and confirm before writing.

### Step 11: Generate HEARTBEAT.md

Generate the HEARTBEAT.md for periodic checks. Match existing style.

**Template structure**:

```markdown
# {Role Name} Heartbeat Check

You are running a periodic heartbeat check. Review the following sources and determine if anything needs Tom's attention{role-specific qualifier}.

## Sources to Check

{Generate 2-4 sources appropriate to the role:}
{- Product roles: Trello board, project status files, recent git activity}
{- Marketing roles: Marketing board, pitch pages, content calendar}
{- Engineering roles: CI status, error logs, deployment status}
{- Project-scoped: Focus on that project's specific sources}

## Response Format

You MUST respond with valid JSON only. No markdown, no explanation — just the JSON object.

If nothing needs attention:
\```json
{"status": "ok"}
\```

If something needs Tom's attention:
\```json
{"status": "action", "actions": [{"type": "dm", "to": "tom", "message": "Summary of what needs attention"}]}
\```

Rules:
- Combine related items into a single action message
- Be concise — Tom reads on mobile
- Lead with the decision or action needed
- If a source file doesn't exist or a command fails, skip it silently
- If all sources are empty or have nothing actionable, respond {"status": "ok"}
```

If the user mentions a Trello board, include it. You can check `~/Documents/GitHub/trw-projects/CLAUDE.md` for known Trello board IDs (shared reference section in the router file).

Show the generated HEARTBEAT.md to the user and confirm before writing.

### Step 12: Generate Operating Manual

**This step is mandatory.** Every exec must have an operating manual at `~/Documents/GitHub/trw-projects/{ROLE}-CLAUDE.md`. This is the canonical reference that gets symlinked into the agent's context and loaded as part of the system prompt.

**Naming convention:**
- CPO -> `CPO-CLAUDE.md`
- CMO -> `CMO-CLAUDE.md`
- VP Engineering -> `VP-ENG-CLAUDE.md`
- CoS -> `COS-CLAUDE.md`
- VP Product (Marginally) -> `VP-PRODUCT-MARGINALLY-CLAUDE.md`

Generate the operating manual following the structure of existing manuals. **Required sections:**

```markdown
# {Role Name} Agent — Operating Manual (v1)

You are the {role title} for Tom's project portfolio.
You operate as a persistent Slack bot (@{role_id}) via the Claude Agent SDK.

---

## Core Identity
{2-3 sentences: what this role owns, what it doesn't}

---

## Executive Team Structure
{Table of all exec roles — who does what, who does NOT what}
{Relationship descriptions: how this role relates to CPO, VP-Eng, etc.}

---

## Core Constraints
{NEVER / DO lists specific to this role}

---

## Product Portfolio (if org-wide) or Project Context (if project-scoped)
{Tables of products/projects this role interacts with}

---

## Trello Integration
{Marketing board or relevant boards with IDs}
{Column definitions}

---

## On Startup

1. Read `~/.local/share/trw-projects/{role_id}-standup.md` — VP-Eng writes this with cards matching your watched labels
2. Read `~/.local/share/trw-projects/{role_id}-state.json` for persistent state
3. If standup file is stale (>2 hours), self-poll Trello for cards with your watched labels as fallback:
   - Use `trello-lite` CLI at `~/Documents/GitHub/trw-projects/tools/trello-lite`
   - Check boards listed in your Trello Integration section
   - Filter for cards with labels: {watched_labels}
4. Synthesize findings and present to Tom (or act autonomously per your constraints)
5. Update `{role_id}-state.json` with `lastStandupRead` timestamp

---

## Your Workflows
{3-5 numbered workflow descriptions specific to this role}
{Each workflow: trigger, steps, output}

---

## Communication Style
{Bullet points matching existing tone: concise, direct, mobile-first}

---

## What You Do vs. Delegate
{Table: task / who / how}

---

## Key Business Context
{Bootstrapped, organic growth, Spine ecosystem, revenue priority, etc.}
```

**Important:** The `## On Startup` section is mandatory for all execs. It defines the pickup loop — how the exec discovers work on session start. The watched labels and state file paths must match what was configured in Step 9.

Adapt other sections to the role — marketing roles get content calendars, product roles get roadmap workflows, engineering roles get deployment/CI sections.

Show the generated manual to the user and confirm before writing.

### Step 13: Create Directory Structure and Symlinks

**If project-scoped** (project_path provided):
```
{project_path}/.chainmaker/agents/vp-product/AGENT.md
{project_path}/.chainmaker/agents/vp-product/HEARTBEAT.md
{project_path}/.chainmaker/agents/vp-product/memory/
{project_path}/.chainmaker/agents/vp-product/context/
```

Note: The directory is always `vp-product/` regardless of role_id (one VP per project).

Also add `.chainmaker/` to the project's `.gitignore` if not already present.

**If NOT project-scoped**:
```
~/.chainmaker/agents/{role_id}/AGENT.md
~/.chainmaker/agents/{role_id}/HEARTBEAT.md
~/.chainmaker/agents/{role_id}/memory/
~/.chainmaker/agents/{role_id}/context/
```

Create the directories and write the files.

**Then symlink the operating manual into context/:**

```bash
# For non-project-scoped agents:
ln -sf ~/Documents/GitHub/trw-projects/{ROLE}-CLAUDE.md ~/.chainmaker/agents/{role_id}/context/{role_id}-operating-manual.md

# For project-scoped agents:
ln -sf ~/Documents/GitHub/trw-projects/{ROLE}-CLAUDE.md {project_path}/.chainmaker/agents/vp-product/context/{role_id}-operating-manual.md
```

The symlink target name should be `{role_id}-operating-manual.md` — this is loaded by `_load_context_files()` in `agent.py` as part of the system prompt.

Verify the symlink resolves correctly after creation.

### Step 14: Append to Chainmaker Registry

Append the new agent entry to `~/.chainmaker/registry.yaml` under the `agents:` key.

Format:
```yaml
  {role_id}:
    name: "{role_name}"
    enabled: false
    slack_bot_token: "${ROLE_UPPER_SLACK_BOT_TOKEN}"
    slack_app_token: "${ROLE_UPPER_SLACK_APP_TOKEN}"
    heartbeat: "{heartbeat}"
    model: "{model}"
    channels:
      - "{channel_id}"  # channel-name
    dm: true
    project_path: "{project_path}"  # only include if project-scoped
    authorized_users:
      - "{user_id}"
```

Notes:
- `enabled: false` always — break-glass safety, user enables manually
- Token env var names: convert role_id to UPPER_SNAKE_CASE (e.g., `vp-product-marginally` -> `VP_PRODUCT_MARGINALLY_SLACK_BOT_TOKEN`)
- Only include `project_path` if the agent is project-scoped
- Only include `channels` if the user specified channels (omit for DM-only)

### Step 15: Create State Files

Create the exec's persistent state and standup files in `~/.local/share/trw-projects/`.

**State file** (`{role_id}-state.json`):

```json
{
  "role": "{role_id}",
  "displayName": "{role_name}",
  "status": "active",
  "updatedAt": "{ISO 8601 timestamp}",
  "watchedLabels": {watched_labels_array},
  "lastStandupRead": null,
  "activeCards": [],
  "decisionsThisSession": []
}
```

**Standup file** (`{role_id}-standup.md`):

```markdown
# {Role Name} Standup
Updated: {ISO 8601 timestamp}

## Status
Awaiting first VP-Eng standup write. No cards routed yet.

## Watched Labels
{comma-separated list of watched labels}

## Cards Matching Your Labels
(VP-Eng will populate this section on its next wave cycle)
```

Create both files. If the files already exist (user chose to continue in Step 3), back up the existing files by appending `.bak` before overwriting.

### Step 16: Update Exec Registry

Update `~/.local/share/trw-projects/exec-registry.json` to include the new exec.

Read the current file, add a new entry to the `execs` array:

```json
{
  "role": "{role_id}",
  "displayName": "{role_name}",
  "watchedLabels": {watched_labels_array},
  "standupFile": "{role_id}-standup.md",
  "stateFile": "{role_id}-state.json",
  "directivesFile": null,
  "active": true
}
```

Write the updated file back. VP-Eng reads this file on startup to know which execs need standups written.

**Idempotency:** If an entry with the same `role` already exists, update it in-place rather than creating a duplicate.

### Step 17: Create Trello Labels

Create the exec's role label on all focus project Trello boards so cards can be tagged for routing.

**Focus project board IDs** (from CLAUDE.md router, shared reference section):

| Project | Board ID |
|---------|----------|
| ink | 698da081c9e429bbfb793fef |
| Marginally | 698da08110a5b7143027f73a |
| Spine Platform | 698da08273c24f82e0ba2c1a |
| TBX | 698da08291deb191e8a57ea8 |
| Athena | 698da082c794c6412c8ae734 |
| Quire | 698e217ab215b5b171fadae4 |
| Colophon | 698e0821aed8cd77e87f5628 |
| Exec Team | 698f3d4dac52e8cd3a0de148 |
| Marketing | 698dff9f11a7dddbdfb5520c |

For each board, create a label with the exec's role_id using `trello-lite`:

```bash
# Path: ~/Documents/GitHub/trw-projects/tools/trello-lite
trello-lite create-label {board_id} "{role_id}" "{color}"
```

**Label colors by role type:**
- Product roles: green
- Engineering/tech roles: blue
- Marketing roles: yellow
- Operations/staff roles: purple

If the label already exists on a board, skip it (trello-lite handles this gracefully).

Report which boards got the label and which already had it.

### Step 18: Print Next Steps

After everything is created, print:

```
Done. {role_name} ({role_id}) is scaffolded with enabled: false.

Created:
- AGENT.md (system prompt)
- HEARTBEAT.md (periodic check)
- Operating manual: ~/Documents/GitHub/trw-projects/{ROLE}-CLAUDE.md
- Context symlink: {agent_dir}/context/{role_id}-operating-manual.md
- State file: ~/.local/share/trw-projects/{role_id}-state.json
- Standup file: ~/.local/share/trw-projects/{role_id}-standup.md
- Exec registry entry in exec-registry.json
- Trello label "{role_id}" on {N} boards

VP-Eng integration:
- VP-Eng will read exec-registry.json on next startup
- VP-Eng will write {role_id}-standup.md filtered by labels: {watched_labels}
- The exec reads this standup on session start (see On Startup in operating manual)

Next steps:
1. Create a Slack app at https://api.slack.com/apps with these scopes:
   Bot Token Scopes:
   - app_mentions:read
   - channels:history
   - channels:join
   - channels:read
   - chat:write
   - files:read
   - files:write
   - groups:history
   - groups:read
   - im:history
   - im:read
   - im:write
   - reactions:read
   - reactions:write
   - users:read
   Socket Mode: enabled
   Event subscriptions (bot events):
   - app_mention
   - message.channels
   - message.groups
   - message.im
2. Add tokens to ~/.chainmaker/.env:
   {ROLE_UPPER}_SLACK_BOT_TOKEN=xoxb-...
   {ROLE_UPPER}_SLACK_APP_TOKEN=xapp-...
3. Set enabled: true in ~/.chainmaker/registry.yaml
4. Restart service: python -m chainmaker.service
5. Tag a card with the "{role_id}" label on any board to test routing
```

## What This Skill Does NOT Do

- Create the Slack app (manual step)
- Restart the service (manual step)
- Enable the agent (manual step — break-glass safety)
- Generate Slack OAuth tokens (manual step)
- Modify VP-Eng's code (VP-Eng reads exec-registry.json automatically)

## Key Rules

- Always default to `enabled: false` — never auto-enable
- Always include Tom (U0AF1P46T8A) in authorized_users
- Token env vars use UPPER_SNAKE_CASE derived from role_id
- Project-scoped agents store config in the project, not in ~/.chainmaker/agents/
- AGENT.md should be concise and direct — match existing style, no fluff
- HEARTBEAT.md must use JSON response format
- **Operating manual is mandatory** — every exec gets a `{ROLE}-CLAUDE.md` in trw-projects/
- **On Startup section is mandatory** — every operating manual must include the pickup loop with standup file + state file + fallback polling
- **Context symlink is mandatory** — operating manual must be symlinked into `context/` so it loads as part of the system prompt
- **State files are mandatory** — every exec gets `{role_id}-state.json` and `{role_id}-standup.md` in `~/.local/share/trw-projects/`
- **Exec registry is mandatory** — every exec must be registered in `exec-registry.json` for VP-Eng routing
- **Trello labels are mandatory** — the exec's label must exist on all focus boards for card tagging
- Always create `context/` directory alongside `memory/` in the agent directory structure
- Ask one question at a time, confirm generated files before writing
- The skill is idempotent — safe to re-run for an existing exec (validates, backs up, updates in-place)
