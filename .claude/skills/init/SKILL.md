---
name: init
description: |
  Initialize a new project or product with full infrastructure: directory structure,
  docs scaffolding (ROADMAP, ADRs, plans, compound docs), .project-status.md, napkin,
  CLAUDE.md, Trello board with standard columns/labels, and optionally a GitHub repo.
  Instance-aware — works for zazig shared work, personal projects, or customer projects.
  Projects live inside a parent repo (e.g. zazig/projects/{name}/). Products get their
  own standalone repo.
author: Tom Weaver
version: 2.3.0
date: 2026-02-18
---

# Init

Scaffold a new project or product with full infrastructure so it's immediately
visible to the dashboard, agents can be dispatched to it, and the napkin is ready.

## Project vs Product

The first question to ask: **"Project or product?"**

| | Project | Product |
|---|---|---|
| **What** | A workstream inside an existing repo | A standalone thing with its own repo |
| **Location** | `{repo}/projects/{name}/` | `~/Documents/GitHub/{name}/` |
| **Git** | Parent's repo | Own repo (new) |
| **Trello board** | Parent's board (or own if large enough) | Own board |
| **Docs** | Own `docs/` under `projects/{name}/` | Own `docs/` at root |
| **Dashboard** | Sub-project entry in parent's `.project-status.md` | Own `.project-status.md` |
| **CLAUDE.md** | `projects/{name}/CLAUDE.md` (scoped) | Root `CLAUDE.md` |
| **Example** | `zazig/projects/web-ui/` | `~/Documents/GitHub/zazig-web-ui/` |

**Default:** If the user is working inside an existing repo (like zazig), default to **project**.
If they're creating something that will live independently, default to **product**.

## What to Ask

Before creating anything, confirm these with the user:

1. **Project or product?** — determines location and repo strategy (see table above)
2. **Name** — lowercase, kebab-case
3. **Instance** — which instance does this belong to? Determines Trello account and workspace.
   - Check `~/.zazig/machine.yaml` for available instances
   - If only one instance exists, use it automatically
   - If multiple, ask the user (e.g. "zazig" for shared work, "tom" for personal)
4. **Parent repo** (projects only) — which repo to file under (e.g. `zazig`, `spine-platform`)
5. **Focus** — should this be a focus project? (adds `focus: true` to .project-status.md)
6. **Summary** — one-line description of what it is
7. **Trello board** — create a Trello board? (default: yes for products, ask for projects)
8. **GitHub repo** (products only) — create a new repo on GitHub?

## Files to Create

### Required (every project and product)

**`.project-status.md`** — in the project/product root:
```markdown
# Project Status
status: active
focus: {true|false}
summary: {one-line summary}
needs-human: {initial human tasks, or "Nothing yet"}
next-for-claude: {initial Claude tasks}
blocked-by: {blockers, or empty}
```

**`.claude/napkin.md`** — from the napkin skill template:
```markdown
# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences

## Codebase Gotchas

## Patterns That Work

## Patterns That Don't Work

## Domain Notes
```

### Docs directory

Create the full docs structure with template files. For **products**, this goes at root.
For **projects**, this goes at `projects/{name}/docs/`.

```
docs/
  ROADMAP.md          # Product roadmap
  adr/                # Architecture Decision Records
    000-template.md   # ADR template
  compound/           # Problem-solution documentation
  meetings/           # Meeting notes
  plans/              # Design docs, PRDs, specs
  mockups/            # UI mockups, wireframes
  research/           # Investigation notes, competitor analysis
  standards/          # Coding standards, style guides
```

**`docs/ROADMAP.md`:**
```markdown
# {Name} Roadmap

## Vision
{What does success look like?}

## Now
{Current sprint / immediate priorities}

## Next
{Next sprint / upcoming work}

## Later
{Future work / ideas / backlog themes}
```

**`docs/adr/000-template.md`:**
```markdown
# ADR-{NNN}: {Title}

**Date:** YYYY-MM-DD
**Status:** proposed | accepted | deprecated | superseded

## Context
{What is the issue that we're seeing that is motivating this decision?}

## Decision
{What is the change that we're proposing and/or doing?}

## Consequences
{What becomes easier or more difficult to do because of this change?}
```

Empty directories get a `.gitkeep` file so they're tracked by git.

### Products only (standalone repos)

**`CLAUDE.md`** — project-specific instructions:
```markdown
# {Product Name}

## What This Is
{one-line description}

## Development
{dev commands, ports, etc. — fill in as project develops}

## Architecture
{brief architecture notes — fill in as project develops}
```

**`.gitignore`** — appropriate for the project's tech stack

**GitHub repo** — if approved:
```bash
cd ~/Documents/GitHub/{name}
git init
git add .
git commit -m "Initial project scaffold"
gh repo create trwpang/{name} --private --source=. --push
```

### Projects only (inside a parent repo)

**`projects/{name}/CLAUDE.md`** — scoped instructions for this project:
```markdown
# {Project Name}

## What This Is
{one-line description}

## Location
This is a project inside the `{parent-repo}` repository at `projects/{name}/`.

## Development
{dev commands, ports, etc. — fill in as project develops}
```

**Parent's `.project-status.md`** — add a `sub-projects` entry:
```markdown
sub-projects:
  - name: {project-name}
    summary: {what this project does}
    needs-human: {human tasks}
    next-for-claude: {claude tasks}
```

## Trello Board Setup

Create a Trello board for products (always) and projects (if asked or if large enough).

### 1. Determine credentials and workspace

The instance determines which Trello account and workspace to use:

```bash
# Use instance-specific credentials via ZAZIG_INSTANCE_ID
export ZAZIG_INSTANCE_ID="{instance_id}"
```

Read the instance config to get the Trello workspace ID:
- Check `~/.zazig/instances/{instance_id}/context.md` for `Workspace ID:`
- Or check the instance YAML (e.g. `zazig.yaml`, `tom-products.yaml`) for `trello.workspace_id`
- If no workspace ID is configured, the board will be created in the user's default workspace — warn the user

### 2. Create the board

```bash
# Collaborative instance (workspace-visible — anyone in the workspace can see it):
curl -s -X POST "https://api.trello.com/1/boards?key=$KEY&token=$TOKEN\
  &name={Board+Name}&defaultLists=false&idOrganization={workspace_id}&prefs_permissionLevel=org"

# Personal instance (members-only):
curl -s -X POST "https://api.trello.com/1/boards?key=$KEY&token=$TOKEN\
  &name={Board+Name}&defaultLists=false&idOrganization={workspace_id}"
```

**Always pass `defaultLists=false`** — we create our own standard columns.

**Always pass `prefs_permissionLevel=org`** for collaborative instances — without it, boards default to "Members and observers" (private), meaning collaborators can't see the board without being individually added as members.

### 3. Create standard columns

Create in order (pos 1-6):

| Pos | Column | Meaning |
|-----|--------|---------|
| 1 | Backlog | All planned work, prioritized top-to-bottom |
| 2 | Up Next | Approved — squads pull from here |
| 3 | In Progress | Actively being worked on |
| 4 | Needs Human | Requires human action |
| 5 | Review | Work complete, waiting for review |
| 6 | Done | Shipped, merged, verified |

### 4. Create standard labels

| Label | Color | Meaning |
|-------|-------|---------|
| blocked | red | Waiting on something |
| needs-human | orange | Requires human action |
| codex-first | blue | Implementation via Codex |
| claude-ok | purple | Needs Opus/Sonnet reasoning |
| design | green | Design/UX/architecture work |
| research | yellow | Investigation, not implementation |
| tech-review | sky | CTO must review before execution |

#### Instance-specific assignment labels

For **collaborative instances** (where `instance_type: collaborative` in the instance YAML),
read the `collaborators` list from the instance config and create an `assigned-{name}` label
for each collaborator. Use lowercase first name, kebab-case if multi-word.

Example — `zazig.yaml` has collaborators Tom and Chris:

| Label | Color | Meaning |
|-------|-------|---------|
| assigned-tom | pink | Card assigned to Tom |
| assigned-chris | lime | Card assigned to Chris |

Cycle through colors: pink, lime, sky, yellow (wrap if >4 collaborators).

For **personal instances** (single owner), skip assignment labels entirely — there's only
one person working the board.

### 5. Update config with new board

After creating the board:

1. **Instance context** (`~/.zazig/instances/{instance_id}/context.md`) — add board to the Boards table
2. **Instance YAML** (e.g. `zazig.yaml`) — add board under `trello.boards`
3. **Project/product CLAUDE.md** — note the board ID so agents working in it know where to find it

## After Creation

1. Verify the project appears in the dashboard (`curl -s http://localhost:8787/api/projects`)
2. If Trello board was created, verify with: `ZAZIG_INSTANCE_ID={id} trello-lite board {board-id}`
3. Update CPO memory if this is a new focus project
4. Tell the user what was created and what they need to do next

## Key Rules

- Always use `trwpang` org for GitHub repos (not `tomweaver`)
- Always create repos as **private** by default
- Never create a repo or Trello board without user approval
- Projects don't get their own git repo — they use the parent's
- Projects live at `{repo}/projects/{name}/` — not at repo root
- The `.project-status.md` file is what makes a project visible to the CPO dashboard
- Always populate the napkin with any domain notes you already know
- **Always pass `idOrganization`** when creating Trello boards — boards without it land in the personal workspace
- **Always pass `prefs_permissionLevel=org`** for collaborative instances — default is "Members and observers" (private), which blocks collaborators from seeing the board
- **Always use `ZAZIG_INSTANCE_ID`** for trello-lite commands — never rely on shell env vars
