# Skills Distribution via CLI

**Date:** 2026-02-25
**Author:** CPO
**Status:** Proposal
**Companion docs:** [Persistent Agent Bootstrap Parity](2026-02-25-persistent-agent-bootstrap-parity-proposal.md)

---

## Problem

Skills are authored and versioned in the zazigv2 git repo but consumed in agent workspaces that exist outside the repo. The current distribution mechanism is copy-on-create: when a workspace is assembled, skill files are copied from the repo into the workspace directory. After creation, there is no sync. This creates three concrete failure modes:

1. **Stale skills in persistent workspaces.** Persistent agents (CPO, CTO) run indefinitely. When a skill is updated in the repo, the persistent workspace retains the old copy. The agent uses outdated instructions until it is manually restarted.

2. **Missing skills in persistent workspaces.** The persistent agent startup path (`handlePersistentJob`) does not pass `skills` or `repoSkillsDir` to `setupJobWorkspace`. Skills are fetched from the database by `company-persistent-jobs` but are never wired into the workspace. This is the known gap documented in the bootstrap parity proposal.

3. **New skills require restart.** When a new skill is added to the repo and assigned to a role in the database, no running agent picks it up. The entire daemon must be restarted, which kills all active persistent agent sessions.

Tom's stated concern: "super worried about skills distribution and updating." This is a real and compounding problem. Every skill improvement is blocked from reaching agents until a manual restart, and there is no visibility into which version of a skill any agent is running.

---

## Current State Analysis

### Two skill registries

The codebase has two distinct sets of skill files:

| Location | Purpose | Consumer | Count |
|----------|---------|----------|-------|
| `projects/skills/*.md` | Pipeline skills for contractors | Orchestrator dispatch, ephemeral workspaces | 7 files |
| `.claude/skills/*/SKILL.md` | Claude Code interactive skills | Persistent agents, developers via `/command` | ~26 directories |

**Pipeline skills** (`projects/skills/`): `jobify`, `featurify`, `spec-feature`, `standalone-job`, `plan-capability`, `reconcile-docs`, `verify-feature`. These are referenced by name in the `roles.skills` database column (e.g., `'{jobify}'` for the breakdown-specialist role). They are copied into workspace `.claude/skills/{name}/SKILL.md` by `setupJobWorkspace`.

**Interactive skills** (`.claude/skills/`): `standup`, `cardify`, `cpo`, `cto`, `review-plan`, `scrum`, `napkin`, etc. These are Claude Code's native skill format — directories containing `SKILL.md` with optional YAML frontmatter. Claude Code discovers these from the `.claude/skills/` directory in the workspace root and makes them available as `/command` slash commands.

### How workspace assembly works today

`setupJobWorkspace()` in `packages/local-agent/src/workspace.ts` creates:

```
workspace/
  .mcp.json               -- MCP server config
  CLAUDE.md                -- prompt stack (personality + role + task)
  .claude/
    settings.json          -- role-scoped tool permissions
    skills/                -- skill files (if provided)
      {name}/
        SKILL.md           -- copied from projects/skills/{name}.md
```

The skill copy logic (lines 153-164 of workspace.ts):

```typescript
if (config.skills && config.repoSkillsDir && config.skills.length > 0) {
  for (const skillName of config.skills) {
    const skillPath = join(config.repoSkillsDir, `${skillName}.md`);
    if (existsSync(skillPath)) {
      const destDir = join(config.workspaceDir, ".claude", "skills", skillName);
      mkdirSync(destDir, { recursive: true });
      copyFileSync(skillPath, join(destDir, "SKILL.md"));
    }
  }
}
```

Key observations:
- Uses `copyFileSync` -- a snapshot copy, not a symlink
- Only copies from `projects/skills/` (the pipeline skills), not `.claude/skills/` (interactive skills)
- Requires both `skills` array and `repoSkillsDir` to be provided

### The persistent agent gap

In `handlePersistentJob()` (executor.ts, line 538), `setupJobWorkspace` is called **without** `skills` or `repoSkillsDir`:

```typescript
setupJobWorkspace({
  workspaceDir,
  mcpServerPath,
  supabaseUrl: this.supabaseUrl,
  supabaseAnonKey: this.supabaseAnonKey,
  jobId,
  companyId: resolvedCompanyId,
  role,
  claudeMdContent: msg.context ?? "",
  // NOTE: no skills, no repoSkillsDir
});
```

Meanwhile, `spawnPersistentAgent()` receives skills from the edge function (`job.skills` on line 394) but discards them -- the synthetic StartJob message does not carry them forward. The edge function correctly returns `skills: role.skills ?? []` for each persistent role, and the database has the skill assignments (e.g., CPO gets `'{standup,cardify,review-plan,cpo,scrum,brainstorming}'`). The data exists; the wiring does not.

### The context assembly path (ephemeral jobs)

For ephemeral contractor jobs dispatched by the orchestrator, skills flow through a different path. The `assembleContext()` function (executor.ts, line 1150) reads skill files from `~/.claude/skills/{name}/SKILL.md` -- the **global** Claude Code skills directory -- and injects their content directly into the prompt context. This is separate from the workspace `.claude/skills/` copy. Both paths exist, serving different purposes:
- The global read (`assembleContext`) injects skill content into the prompt text sent to `claude -p`
- The workspace copy (`setupJobWorkspace`) makes skills available as `/command` slash commands in interactive sessions

### What Tom has done manually

Tom's global `~/.claude/skills/` directory contains 11 symlinks, several pointing into the zazigv2 repo:
- `cardify -> /Users/tomweaver/Documents/GitHub/zazigv2/.claude/skills/cardify`
- `healthcheck -> /Users/tomweaver/Documents/GitHub/zazigv2/.claude/skills/healthcheck`
- `internal-proposal -> /Users/tomweaver/Documents/GitHub/zazigv2/.claude/skills/internal-proposal`
- `review-plan -> /Users/tomweaver/Documents/GitHub/zazigv2/.claude/skills/review-plan`
- etc.

This proves the symlink approach works for Claude Code skill discovery. Claude Code follows symlinks when scanning `.claude/skills/`. Tom has manually created the pattern we need to automate.

### How Claude Code discovers skills

Claude Code looks for skills in two locations:
1. **Global:** `~/.claude/skills/*/SKILL.md` -- available in all sessions
2. **Project-local:** `{workspace}/.claude/skills/*/SKILL.md` -- available only in that workspace

Each skill directory must contain a `SKILL.md` file. Optionally, the file has YAML frontmatter with `name` and `description` fields that control the `/command` name and when Claude suggests using it. Claude Code follows symlinks in both locations.

---

## Architecture Options

### Option A: Symlinks from workspaces to repo

Replace `copyFileSync` with `symlinkSync` in `setupJobWorkspace`. Each workspace skill directory becomes a symlink to the repo source.

```
workspace/.claude/skills/jobify -> /path/to/zazigv2/projects/skills/jobify-dir/
```

Or, more precisely, since pipeline skills are flat files but Claude Code expects `{name}/SKILL.md`:

```
workspace/.claude/skills/jobify/SKILL.md -> /path/to/zazigv2/projects/skills/jobify.md
```

**Pros:**
- Changes in the repo instantly reflect in all workspaces
- No sync daemon or watcher needed
- Single source of truth -- no copies to diverge
- Zero maintenance after initial creation

**Cons:**
- Broken symlinks if the repo is moved or the checkout is deleted
- Cross-filesystem symlinks (if workspace and repo are on different volumes) fail on some systems
- Git worktrees with different branch checkouts could serve different skill versions
- Symlinks from `workspace/.claude/skills/{name}` to repo files require the repo path to be known at workspace creation time -- which it already is (the daemon runs from the repo)
- If an agent or skill runs `rm -rf .claude/skills/` (cleanup), the symlink is destroyed

**Risk assessment:** Low risk. macOS supports symlinks reliably. The repo path is deterministic (derived from the daemon's own location). The workspaces and repo are on the same filesystem (`~/.zazigv2/` and `~/Documents/GitHub/zazigv2/` are both under the user's home directory). Git worktree complications are theoretical -- zazigv2 does not currently use worktrees for the daemon.

### Option B: Pull-on-startup (copy with freshness check)

On `zazig start`, the CLI scans the skills registry in the repo and copies fresh versions into all active workspaces. Skills are stamped with a hash or mtime so the CLI can detect staleness.

**Pros:**
- No symlink fragility
- Works cross-filesystem
- Explicit, auditable sync -- can log what was updated

**Cons:**
- Skills go stale during a session (same problem as today, just less severe)
- Requires explicit CLI invocation to refresh
- Adds complexity to the CLI startup path
- Still copies files -- divergence is possible if the copy fails partway

### Option C: File watcher daemon

The zazig daemon (or a dedicated sidecar) uses `fs.watch` or `chokidar` to monitor the skills directories in the repo. On any change, it syncs the updated file to all active workspaces.

**Pros:**
- Real-time sync without symlinks
- Can handle both additions and deletions
- Can trigger notifications to agents ("skill X was updated")

**Cons:**
- New runtime dependency (file watcher)
- Resource overhead -- watching directories for long-running daemon
- Complex failure modes (what if the watcher crashes? what if the copy fails?)
- `fs.watch` is unreliable on macOS for some edge cases (renames, deeply nested changes)
- Doesn't solve the fundamental problem that copies can diverge -- it just reduces the window

### Option D: Hybrid -- symlinks with CLI management

Combine Options A and B. The CLI manages symlink creation and validation. `zazig start` creates symlinks for all role-appropriate skills. `zazig skills sync` (new command) re-validates and repairs broken symlinks. The daemon itself does not watch files -- it trusts the symlinks.

**Pros:**
- All the benefits of symlinks (instant updates, single source of truth)
- CLI provides a management interface for diagnosing issues
- No runtime overhead -- no watcher, no daemon changes
- `zazig skills status` gives visibility into what each workspace has
- Broken symlinks are detectable and repairable without restarting

**Cons:**
- Requires symlink creation logic in the CLI and in workspace assembly
- New CLI subcommands to implement
- Slightly more complex than pure symlinks (Option A) because of the management layer

---

## Recommendation: Option D -- Hybrid symlinks with CLI management

The recommended approach is Option D. Here is the rationale:

1. **Symlinks solve the staleness problem completely.** A symlink to the repo source means there is no copy to go stale. When Tom edits `projects/skills/jobify.md`, every workspace with a symlink to that file sees the change immediately. No restart, no sync, no watcher.

2. **The CLI provides operational visibility.** `zazig skills status` answers the question "which skills does each workspace have, and are they current?" This is the version awareness Tom wants.

3. **The management layer handles the edge cases.** Broken symlinks (repo moved), missing skills (new role added), and stale workspaces (created before a skill existed) are all diagnosable and repairable without restarting agents.

4. **Minimal runtime overhead.** No watcher daemon, no polling loop. The symlinks are filesystem primitives that the OS handles natively.

5. **Proven pattern.** Tom has already manually created symlinks in `~/.claude/skills/` that point into the repo. Claude Code follows them correctly. We are automating what already works.

---

## Detailed Design

### 1. Skill registries: unification

Today there are two separate skill directories:
- `projects/skills/*.md` -- pipeline skills (flat files, no SKILL.md wrapper)
- `.claude/skills/*/SKILL.md` -- interactive skills (Claude Code format)

The distribution system should handle both. The distinction matters because pipeline skills are referenced by name in the database (`roles.skills` column) and need to be available as `/command` slash commands in agent workspaces, while interactive skills are already in Claude Code format.

**Proposed convention:**

All skills live in Claude Code format: `{name}/SKILL.md`. The two registries remain separate directories but use the same format:

```
projects/skills/            -- pipeline skills (for contractors)
  jobify/SKILL.md
  featurify/SKILL.md
  spec-feature/SKILL.md
  ...

.claude/skills/             -- interactive skills (for persistent agents + devs)
  standup/SKILL.md
  cardify/SKILL.md
  cpo/SKILL.md
  ...
```

**Migration:** The seven flat files in `projects/skills/` (`jobify.md`, etc.) are moved into `projects/skills/{name}/SKILL.md` directories. This is a one-time restructure. Existing `setupJobWorkspace` code is updated to match.

Alternatively, if restructuring `projects/skills/` is disruptive, the symlink creation logic can handle the translation: a symlink from `workspace/.claude/skills/jobify/SKILL.md` pointing to `repo/projects/skills/jobify.md`. The directory wrapper is created in the workspace; only the SKILL.md itself is symlinked.

### 2. Role-scoped skill resolution

Not all agents get all skills. The database defines the mapping:

```sql
-- roles table
cpo:                  '{standup,cardify,review-plan,cpo,scrum,brainstorming}'
cto:                  '{cto,multi-agent-review}'
senior-engineer:      '{commit-commands:commit}'
project-architect:    '{featurify}'
breakdown-specialist: '{jobify}'
monitoring-agent:     '{internal-proposal,deep-research,x-scan,repo-recon}'
verification-specialist: '{verify-feature}'
```

The distribution system uses these arrays to determine which skills to symlink into each workspace. The resolution logic:

```
1. For a given role, read its skills[] array from the database (already fetched by company-persistent-jobs edge function)
2. For each skill name:
   a. Check projects/skills/{name}/SKILL.md (or projects/skills/{name}.md during migration)
   b. Check .claude/skills/{name}/SKILL.md
   c. If found, create symlink in workspace/.claude/skills/{name}/SKILL.md -> source
   d. If not found, warn (non-fatal)
3. For persistent agents, also include interactive skills from .claude/skills/ that are in the role's skill list
```

The lookup order (pipeline skills first, then interactive skills) means a skill name that exists in both locations will resolve to the pipeline version. In practice, there is no overlap -- pipeline skills have pipeline-specific names (jobify, featurify) and interactive skills have interaction-specific names (standup, scrum).

### 3. Workspace assembly changes

`setupJobWorkspace` in `workspace.ts` gains a new option:

```typescript
export interface WorkspaceConfig {
  // ... existing fields ...
  skills?: string[];
  repoSkillsDir?: string;
  repoInteractiveSkillsDir?: string;  // NEW: path to .claude/skills/ in repo
  useSymlinks?: boolean;               // NEW: symlink instead of copy
}
```

The skill injection logic becomes:

```typescript
if (config.skills && config.skills.length > 0) {
  for (const skillName of config.skills) {
    // Resolve source path (pipeline skills first, then interactive)
    let sourcePath: string | null = null;

    if (config.repoSkillsDir) {
      // Try projects/skills/{name}.md (flat file format)
      const flatPath = join(config.repoSkillsDir, `${skillName}.md`);
      if (existsSync(flatPath)) sourcePath = flatPath;

      // Try projects/skills/{name}/SKILL.md (directory format)
      const dirPath = join(config.repoSkillsDir, skillName, "SKILL.md");
      if (!sourcePath && existsSync(dirPath)) sourcePath = dirPath;
    }

    if (!sourcePath && config.repoInteractiveSkillsDir) {
      const interactivePath = join(config.repoInteractiveSkillsDir, skillName, "SKILL.md");
      if (existsSync(interactivePath)) sourcePath = interactivePath;
    }

    if (!sourcePath) {
      console.warn(`[workspace] Skill "${skillName}" not found in repo — skipping`);
      continue;
    }

    const destDir = join(config.workspaceDir, ".claude", "skills", skillName);
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, "SKILL.md");

    if (config.useSymlinks) {
      // Remove existing file/symlink if present (idempotent)
      try { unlinkSync(destPath); } catch { /* doesn't exist — fine */ }
      symlinkSync(sourcePath, destPath);
    } else {
      copyFileSync(sourcePath, destPath);
    }
  }
}
```

### 4. Persistent agent wiring

In `handlePersistentJob()` and `spawnPersistentAgent()`, pass the skills through:

```typescript
// In spawnPersistentAgent(), carry skills on the synthetic message:
const syntheticMsg = {
  ...existing fields,
  roleSkills: job.skills,  // NEW: was being dropped
};

// In handlePersistentJob(), pass skills to setupJobWorkspace:
const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(thisDir, "..", "..");  // dist/ -> local-agent/ -> repo root

setupJobWorkspace({
  ...existing fields,
  skills: msg.roleSkills,                                    // NEW
  repoSkillsDir: join(repoRoot, "projects", "skills"),       // NEW
  repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),  // NEW
  useSymlinks: true,                                         // NEW
});
```

This closes the gap identified in the bootstrap parity proposal. Persistent agents get their role-scoped skills on every startup, and because they are symlinks, they stay current.

### 5. CLI commands

New `zazig skills` subcommand group:

#### `zazig skills status`

Shows the current state of skill distribution across all active workspaces.

```
$ zazig skills status

Workspace: 00000000-0000-0000-0000-000000000001-cpo-workspace (CPO)
  standup         ✓ symlink → .claude/skills/standup/SKILL.md
  cardify         ✓ symlink → .claude/skills/cardify/SKILL.md
  review-plan     ✓ symlink → .claude/skills/review-plan/SKILL.md
  cpo             ✓ symlink → .claude/skills/cpo/SKILL.md
  scrum           ✓ symlink → .claude/skills/scrum/SKILL.md
  brainstorming   ✓ symlink → .claude/skills/brainstorming/SKILL.md
  spec-feature    ✗ MISSING — not in workspace
  plan-capability ✗ MISSING — not in workspace

Workspace: job-abc123 (breakdown-specialist, ephemeral)
  jobify          ✓ copy → projects/skills/jobify.md (mtime: 2026-02-24T10:30:00Z)
```

Implementation: scan `~/.zazigv2/*/` for directories containing `.claude/settings.json`. Read the settings to determine the role. Cross-reference with the role's expected skills from the database (or a local cache). Check each expected skill for presence, type (symlink vs copy), and target validity.

#### `zazig skills sync`

Ensures all active persistent workspaces have their expected skills as symlinks.

```
$ zazig skills sync

Syncing skills for CPO workspace...
  + spec-feature    → symlink created
  + plan-capability → symlink created
  ~ standup         → was copy, replaced with symlink
  ✓ cardify         → already symlinked, target valid

Syncing skills for CTO workspace...
  ✓ cto             → already symlinked, target valid
  ✓ multi-agent-review → already symlinked, target valid

Done. 2 workspaces synced, 3 skills updated.
```

Implementation:
1. Discover active persistent workspaces (same scan as `status`)
2. For each workspace, determine the role and its expected skills
3. For each expected skill, check current state (missing, copy, symlink, broken symlink)
4. Create or repair symlinks as needed
5. Report changes

This command is idempotent and safe to run at any time.

#### `zazig skills sync` on startup

Integrate `skills sync` into `zazig start`. After the daemon spawns and persistent agents are discovered, run the sync automatically:

```typescript
// In start.ts, after daemon spawn succeeds:
console.log("Syncing skills to agent workspaces...");
await syncSkillsToWorkspaces(repoRoot, companyId);
```

This ensures every `zazig start` begins with fresh symlinks. Since persistent workspaces are not destroyed between restarts (they are at stable paths like `~/.zazigv2/{companyId}-cpo-workspace/`), the symlinks from a previous session are still there and either valid (repo hasn't moved) or repairable (sync replaces broken links).

### 6. Repo path resolution

Both the CLI and the daemon need to know the repo root to create symlinks. Current resolution:

- **Daemon:** runs from `packages/local-agent/dist/index.js`. Repo root is `join(thisDir, '..', '..')` — already used in the codebase for `repoSkillsDir`.
- **CLI:** runs from `packages/cli/dist/index.js`. Same relative resolution works.

This path is deterministic because both packages live inside the monorepo. No environment variable or config needed.

For robustness, validate the resolved path by checking for `projects/skills/` existence:

```typescript
function resolveRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(thisDir, "..", "..");
  if (!existsSync(join(candidate, "projects", "skills"))) {
    throw new Error(`Cannot resolve repo root — expected projects/skills/ at ${candidate}`);
  }
  return candidate;
}
```

### 7. Version awareness and audit trail

Skills are git-tracked files. Version awareness comes for free:

- **Current version:** `git log -1 --format="%H %ai" -- projects/skills/jobify.md` gives the commit hash and date of the last change.
- **Which version an agent used:** The symlink always points to HEAD of the checked-out branch. If the repo is on `main`, the agent uses `main`'s version. If the repo is on a feature branch, the agent uses that branch's version.
- **Audit after the fact:** Git history shows when each skill was changed and what changed. Cross-referencing with job timestamps gives a complete audit trail.

For `zazig skills status`, include the git hash of each skill's last commit:

```
standup  ✓ symlink  last modified: a1b2c3d (2026-02-24 10:30)
```

No new versioning mechanism is needed. Git is the version control system.

### 8. Interaction with assembleContext

The `assembleContext()` function (executor.ts, line 1150) reads skill content from `~/.claude/skills/{name}/SKILL.md` (the global Claude Code skills directory) and injects it into the prompt text for ephemeral jobs running in `claude -p` mode. This path is separate from the workspace skill distribution.

This needs reconciliation. Currently:
- Ephemeral jobs: skills injected into prompt text via `assembleContext` AND copied into workspace `.claude/skills/`
- Persistent agents: skills not injected into prompt, and NOT copied into workspace

The proposal does not change `assembleContext`'s behaviour for ephemeral jobs. For persistent agents, skills are made available as `/command` slash commands via workspace symlinks -- not injected into the initial prompt. This is correct because persistent agents run in interactive mode (not `-p` print mode), and skills are invoked on-demand via slash commands, not front-loaded into context.

---

## Implementation Plan

### Phase 1: Close the persistent agent gap (standalone, no CLI changes)

**Scope:** Wire skills through `handlePersistentJob` using symlinks. This is the minimum viable fix.

**Changes:**
1. `workspace.ts`: Add `repoInteractiveSkillsDir` and `useSymlinks` to `WorkspaceConfig`. Update skill injection to support symlinks.
2. `executor.ts` `spawnPersistentAgent()`: Pass `job.skills` as `roleSkills` on the synthetic message.
3. `executor.ts` `handlePersistentJob()`: Pass `skills`, `repoSkillsDir`, `repoInteractiveSkillsDir`, and `useSymlinks: true` to `setupJobWorkspace`.

**Estimated complexity:** Simple. Three files, ~20 lines of new code. The infrastructure exists; this is wiring.

**Dependencies:** None. Can be done independently of the bootstrap parity feature.

### Phase 2: CLI skills management commands

**Scope:** Add `zazig skills status` and `zazig skills sync` commands.

**Changes:**
1. New file: `packages/cli/src/commands/skills.ts` — implements status and sync.
2. `packages/cli/src/index.ts` — register the `skills` command.
3. `packages/cli/src/commands/start.ts` — integrate sync into startup (optional, can be deferred).

**Estimated complexity:** Medium. New CLI command with workspace scanning, role resolution, and symlink management. The workspace scanning logic (finding active workspaces, reading their roles) is new code.

**Dependencies:** Phase 1 (the workspace assembly changes must be in place for sync to create symlinks in the correct format).

### Phase 3: Startup integration

**Scope:** Run `skills sync` automatically as part of `zazig start`.

**Changes:**
1. `packages/cli/src/commands/start.ts` — call sync after daemon spawn.
2. Ensure sync is fast enough to not noticeably delay startup (should be <1 second for typical workspace counts).

**Dependencies:** Phase 2.

### Phase 4: Pipeline skills format migration (optional)

**Scope:** Restructure `projects/skills/*.md` into `projects/skills/*/SKILL.md` for format consistency.

**Changes:**
1. Move seven files into directory wrappers.
2. Update `setupJobWorkspace` default path resolution.
3. Update any hardcoded references in tests.

**Dependencies:** None. Can happen independently. Phase 1 handles both formats, so this is a cleanup, not a prerequisite.

---

## What This Does Not Cover

- **Skill authoring workflow.** How skills are written, reviewed, and approved is unchanged. They are still markdown files in the git repo, edited via normal development workflow.
- **Skill content changes.** This proposal is about distribution, not about what skills contain. Skill quality and correctness remain the skill author's responsibility.
- **Hot reload of running Claude Code sessions.** Even with symlinks, a Claude Code session that has already loaded a skill into its context will not re-read the file mid-conversation. The symlink ensures the next invocation of `/command` reads the latest version, but an in-flight conversation uses whatever was loaded at invocation time. This is a Claude Code limitation, not a distribution issue.
- **Remote skill distribution.** This proposal covers single-machine deployments where the repo and workspaces are on the same filesystem. Multi-machine distribution (skills served from a CDN or Supabase) is a separate concern for when zazigv2 supports remote agents.
- **Skill testing.** There is no mechanism to test a skill before distributing it. A broken skill pushed to `main` will be distributed to all agents. This is a gap but not in scope for distribution plumbing.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Broken symlinks after repo move | Low | Medium — agents lose skill access | `zazig skills sync` detects and repairs; `zazig skills status` shows broken links |
| Symlink not followed by Claude Code | Very low | High — skills invisible to agents | Already validated: Tom's manual symlinks work. Test coverage in Phase 1. |
| Skill name collision between registries | Very low | Low — wrong skill loaded | Lookup order is deterministic (pipeline first). No current collisions exist. |
| Agent deletes `.claude/skills/` | Low | Medium — skills lost until next sync | `zazig skills sync` re-creates. Persistent workspaces survive daemon restarts. |
| Repo on different filesystem than workspaces | Very low (macOS) | High — symlinks fail | Validate at creation time, fall back to copy with a warning. |

---

## Success Criteria

1. After `zazig start`, every persistent agent workspace contains symlinks for all skills defined in that role's `skills[]` array.
2. Editing a skill file in the repo is immediately reflected in all persistent agent workspaces (verified by reading the workspace skill file and confirming it matches the repo source).
3. `zazig skills status` accurately reports the state of every skill in every active workspace.
4. `zazig skills sync` is idempotent -- running it twice produces no changes the second time.
5. No existing ephemeral job workflow is broken -- ephemeral workspaces continue to work with copies (symlinks are used for persistent workspaces).
