# Exec Context Skills — Portable Identity for Cross-Session Awareness

**Date:** 2026-03-09
**Status:** Implemented (Phase 1 + Phase 2, 2026-03-09) — merged to master (PR #220)
**Authors:** Tom Weaver, Claude
**Focus Areas:** Autonomous Organisation, The Full Loop
**Depends on:** Persistent Identity
**Related:** Exec Heartbeat & Cache-TTL design (`2026-03-09-exec-heartbeat-and-cache-ttl-design.md`), Expert Sessions (ORG MODEL), Chainmaker `new-exec` skill

---

## Problem

Persistent execs (CPO, CTO) accumulate knowledge, context, and working state across sessions. But this knowledge is trapped inside their persistent tmux session. When any other session needs that knowledge — an expert session, a contractor job, a diagnostic run, a fresh session after crash — it's inaccessible.

Today's workarounds:
- **Expert sessions** get a brief and the expert role's prompt, but no awareness of CPO's current priorities, active decisions, or strategic context
- **Contractor jobs** get a spec and role prompt, but can't access exec-level reasoning about *why* the work was commissioned
- **Fresh sessions after crash/reset** start from CLAUDE.md alone — conversation context is lost, working state must be rebuilt from scratch
- **Inter-exec consultation** doesn't exist — CTO can't reference CPO's current thinking without the human copy-pasting

The `new-exec` skill from Chainmaker V1 solved a related problem: it scaffolded AGENT.md + HEARTBEAT.md + operating manuals so each exec had a portable identity. But those were hand-maintained files in a filesystem. zazigv2's identity is DB-backed and dynamically assembled.

---

## Design: Auto-Generated Per-Exec Skills

Each persistent exec gets an auto-generated skill that packages their identity, knowledge references, and workspace links into a portable format any session can load.

### Skill Name Convention

`/as-{role}` — e.g., `/as-cpo`, `/as-cto`

The `as-` prefix signals "operate with this exec's context" without being that exec. It's a perspective shift, not an identity claim.

### Skill Contents

```markdown
---
name: as-{role}
description: |
  Load {Role Display Name}'s context, knowledge, and workspace links into
  this session. Use when you need {role}-level awareness in a non-persistent
  context — expert sessions, contractors, diagnostics, or inter-exec
  consultation.
---

# Operating with {Role Display Name}'s Context

## Who {Role Display Name} Is
{From roles.prompt — the exec's core identity, responsibilities, constraints}

## Current Priorities
{From the exec's memory files — what they're focused on right now}
Read: {workspace}/.claude/memory/priorities.md

## Active Decisions
{From the exec's memory files — open decisions awaiting input}
Read: {workspace}/.claude/memory/decisions.md

## Workspace Access
- **Memory**: {workspace}/.claude/memory/
- **Repos**: {workspace}/repos/
- **State**: {workspace}/.claude/workspace-config.json
- **Napkin**: {workspace}/.claude/napkin.md

## Current Heartbeat Tasks
{From roles.heartbeat_md — what the exec checks on each wake}

## Doctrines
{From roles.prompt or a future doctrines column — beliefs this exec holds}

## How to Use This Context
You are NOT {role display name}. You are a session that has been given
{role display name}'s context and workspace access. Guidelines:

1. **Read memory files first** — they contain the exec's current working state
2. **Respect doctrines** — decisions should be consistent with this exec's beliefs
3. **Don't modify memory** — you're a reader, not the owner. Write findings
   to your own report, not to the exec's memory files
4. **Reference, don't assume** — if a memory file doesn't exist or is empty,
   note the gap rather than guessing
```

### What Goes In vs What's Referenced

The skill is a **map, not a copy**. It contains:
- **Inline**: Role identity, doctrines, constraints (stable, rarely change)
- **References**: Memory files, workspace paths, repo links (dynamic, read on demand)

This keeps the skill lightweight (~500 tokens inline) while giving access to the exec's full knowledge base via filesystem reads.

---

## Generation

### When Skills Are Generated

1. **On persistent agent startup** — `handlePersistentJob` generates the skill during workspace assembly
2. **On cache-TTL reset** — skill is regenerated with fresh data from DB
3. **On role prompt update** — if `roles.prompt` changes, next heartbeat/reset regenerates the skill

### Where Skills Are Written

Two locations:

```
1. {exec_workspace}/.claude/skills/as-{role}/SKILL.md
   └── For the exec's own reference (can /as-cpo itself to recall its own context)

2. {repo_root}/.claude/skills/as-{role}/SKILL.md
   └── For cross-session access (expert sessions, contractors, other execs)
```

Location 2 is the enabler. The workspace assembly for expert sessions and contractor jobs already includes `repoInteractiveSkillsDir` — skills from the repo's `.claude/skills/` directory are copied into every session. By writing exec context skills there, they're automatically available everywhere.

### Generation Code

```typescript
// packages/local-agent/src/workspace.ts

interface ExecSkillInput {
  role: {
    name: string;
    display_name: string;
    prompt: string;
    heartbeat_md: string | null;
  };
  workspacePath: string;
  companyId: string;
}

async function generateExecContextSkill(input: ExecSkillInput): Promise<string> {
  const { role, workspacePath, companyId } = input;

  const skillContent = `---
name: as-${role.name}
description: |
  Load ${role.display_name}'s context, knowledge, and workspace links.
  Use for ${role.name}-level awareness in non-persistent sessions.
---

# Operating with ${role.display_name}'s Context

## Who ${role.display_name} Is
${role.prompt}

## Workspace Access
- **Memory**: ${workspacePath}/.claude/memory/
- **Repos**: ${workspacePath}/repos/
- **State**: ${workspacePath}/.claude/workspace-config.json
- **Napkin**: ${workspacePath}/.claude/napkin.md

${role.heartbeat_md ? `## Current Heartbeat Tasks\n${role.heartbeat_md}\n` : ''}
## How to Use This Context
You are NOT ${role.display_name}. You have been given their context and
workspace access. Read their memory files first. Respect their doctrines.
Don't modify their memory — write to your own report instead.
`;

  return skillContent;
}

// Called from handlePersistentJob and resetPersistentSession
async function writeExecSkill(
  skillContent: string,
  roleName: string,
  execWorkspacePath: string,
  repoRoot: string,
): Promise<void> {
  const locations = [
    path.join(execWorkspacePath, '.claude', 'skills', `as-${roleName}`),
    path.join(repoRoot, '.claude', 'skills', `as-${roleName}`),
  ];

  for (const dir of locations) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), skillContent);
  }
}
```

---

## Use Cases

### 1. Expert Session with Exec Context

Human commissions a Supabase Expert to fix a migration issue. The expert needs to understand why CPO prioritised this work and what the broader context is.

```
Expert session starts → workspace assembled with repo skills
→ Expert has /as-cpo available
→ Expert reads CPO's memory/priorities.md
→ Expert understands: "CPO flagged this as P0 because it blocks the auto-scheduling feature"
→ Expert's fix accounts for the broader context
```

### 2. Post-Crash Continuity

CPO's persistent session crashes. Before the daemon restarts it, an urgent idea arrives via Telegram.

```
Human starts ad-hoc Claude session in the repo
→ /as-cpo loads CPO's context
→ Session reads CPO's memory files, understands current inbox state
→ Session triages the urgent idea with CPO-level awareness
→ When CPO's persistent session restarts, it picks up the triage from memory files
```

### 3. Inter-Exec Consultation

CTO is making an architecture decision about the memory system. Needs to understand CPO's product priorities before choosing an approach.

```
CTO session → /as-cpo
→ CTO reads CPO's priorities.md: "Memory P1 is active, P0 focus is exec autonomy"
→ CTO designs memory architecture that serves the autonomy goal
→ CTO writes decision to own memory, references CPO priorities
```

### 4. Contractor with Strategic Context

Breakdown Specialist is decomposing a feature into jobs. The feature spec says "improve pipeline health" but doesn't specify what "health" means in the current context.

```
Contractor session assembled with repo skills
→ /as-cpo available → reads CPO's memory
→ Discovers CPO's definition of pipeline health: "stuck features < 3, failed features < 2/day"
→ Creates jobs that target specific health metrics, not generic improvements
```

### 5. Diagnostic Session

Senior Engineer is diagnosing a failed feature. Needs to understand what CPO intended.

```
Diagnosis job starts → workspace includes repo skills
→ /as-cpo loads CPO context
→ Reads CPO's memory for the feature's strategic context
→ Diagnosis report includes: "CPO intended X, but implementation did Y — mismatch in spec"
```

---

## Memory File Conventions

For exec context skills to be useful, execs need to maintain readable memory files. This is a convention, not enforced infrastructure.

### Recommended Memory Structure

```
{workspace}/.claude/memory/
├── priorities.md       # Current focus areas, P0-P3 items
├── decisions.md        # Open decisions, who's blocked on what
├── context.md          # Working context: what happened recently, what's in flight
├── patterns.md         # Observed patterns, recurring issues
└── handoff.md          # Explicit notes for anyone picking up this exec's context
```

The HEARTBEAT.md "On Every Wake" section should include: "Update `.claude/memory/` with current state." This ensures memory files stay fresh across cache-TTL resets.

### handoff.md

A special file that the exec writes specifically for cross-session consumers:

```markdown
# CPO Handoff Notes

Last updated: 2026-03-09T14:30:00Z

## If You're Picking Up My Work
- Auto-scheduling is the P0 focus. Everything else is P1 or lower.
- The retry mechanism (request-feature-fix) is being redesigned — don't use the current one.
- Feature f2806c36 (Triggers & Events) is intentionally failed — superseded by reconciliation doc.

## Active Decisions Waiting on Human
- Memory system: P1 vs P2 scope (Tom needs to decide)
- Model flexibility: whether to support non-Anthropic models (parked)

## Known Issues
- Diagnosis jobs sometimes produce NO_REPORT — edge function fix deployed, awaiting daemon promote
- Expert sessions don't clean up git worktrees on failure
```

This file is the most valuable thing another session can read. It's the exec's own words about what matters right now.

---

## Interaction with Expert Sessions

Expert sessions already assemble workspaces with repo skills. The exec context skills appear automatically — no changes to `expert-session-manager.ts` needed.

However, the expert's brief could be enriched:

```typescript
// In expert-session-manager.ts, when assembling the brief:
const brief = `## Your Task
${msg.brief}

## Available Context
You have access to exec context skills. If you need strategic context
about why this work was commissioned, use /as-cpo to load CPO's perspective.
`;
```

This is a suggestion in the brief, not an automatic injection — the expert decides whether exec context is relevant to their task.

---

## Interaction with Cache-TTL

When a persistent exec's session resets via cache-TTL:

1. Exec writes memory files (last act before reset, prompted by HEARTBEAT.md)
2. Session killed, workspace preserved (memory files survive)
3. Exec context skill regenerated from fresh DB data
4. New session starts, reads HEARTBEAT.md, reads memory files → full context restored
5. Other sessions that loaded `/as-{role}` get stale skill content but fresh memory files (memory files are read on demand, not cached in the skill)

The skill is the map. The memory files are the territory. The map gets regenerated on reset. The territory persists.

---

## Security Considerations

- **Read-only by convention**: The skill tells consumers "don't modify memory." This is a convention, not enforcement. A malicious or confused session could write to an exec's memory files. For Phase 1, trust is sufficient. If this becomes a problem, add filesystem permissions (exec workspace owned by a different user) or move memory to DB with RLS.

- **Prompt injection via memory files**: A compromised session could write poisoned content to memory files, which the exec would then read on next wake. Mitigation: HEARTBEAT.md should include "Verify memory files haven't been tampered with" as a wake task. More robust: checksum memory files, alert on unexpected changes.

- **Scope leaking**: An expert session with `/as-cpo` can read CPO's memory, including potentially sensitive strategic context. This is intentional — if you commission an expert, you want them to have context. But it means expert roles should be trusted.

---

## Implementation Plan

### Phase 1: Basic Skill Generation — DONE

1. **`generateExecSkill()` in `workspace.ts`** — writes exec-local skill to `{workspace}/.claude/skills/as-{role}/SKILL.md`
2. **Called from `handlePersistentJob`** in executor.ts — generates on persistent agent startup
3. **Includes role prompt, workspace paths, and heartbeat tasks**

### Phase 1b: Shared Skill Publication — DONE (PR #220)

1. **`publishSharedExecSkill()` in `workspace.ts`** — writes sanitized skill to `{repoRoot}/.claude/skills/as-{role}/SKILL.md`
2. **Called from `handlePersistentJob`** immediately after `generateExecSkill()`
3. **Sanitization:** prompt summarised to first 5 non-empty lines, `$HOME` replaced with `~` for portability, memory marked READ ONLY, includes consumer guidance section ("You are not the {role}")
4. **Syncs via existing skills pipeline:** `repoInteractiveSkillsDir` already points at `{repoRoot}/.claude/skills/` in executor.ts, expert-session-manager.ts — skills auto-copied into every workspace
5. **Tests:** 2 test cases in workspace.test.ts (truncation + portable paths, short prompt without truncation), mock added to executor.test.ts — all 72 tests pass

### Phase 2: Memory File Bootstrap — NOT STARTED

1. **Seed memory files** — create initial `priorities.md`, `decisions.md`, `handoff.md` for CPO and CTO
2. **Add to HEARTBEAT.md** — "Update memory files" as a wake task
3. **Test cross-session access** — commission an expert session, verify `/as-cpo` works

### Phase 3: Enriched Skills

1. **Add doctrines** — pull from a future `doctrines` column on roles
2. **Add active feature context** — query pipeline for in-flight features, embed summary
3. **Add recent decisions** — query events table for recent CPO decisions, embed digest
4. **Dynamic enrichment** — skill content includes live data, not just static role prompt

---

## Open Questions

1. **Should skills be in `.gitignore`?** They're auto-generated and contain role prompts from the DB. Committing them to git leaks the prompt but makes them version-controlled. Current recommendation: `.gitignore` them — they're ephemeral artifacts, not source of truth.

2. **Skill freshness.** If an exec's priorities change mid-day but no cache-TTL reset has fired, the skill content is stale. The memory files are fresh (exec writes them), but the skill's inline content (role prompt, heartbeat tasks) might be outdated. Is this a problem? Probably not — the inline content is stable (identity, constraints), and the dynamic content is referenced (memory files, read on demand).

3. **Multiple execs, multiple skills.** With CPO + CTO today, that's 2 skills. With CFO, CMO, etc., it could be 6-8. Each is ~500 tokens inline. Is that too much noise in the skills list? Probably not — skills are listed but not loaded until invoked.

4. **Should non-persistent roles get skills?** A Breakdown Specialist or Verification Specialist doesn't have a persistent workspace, but they do have a role prompt and constraints. A lightweight skill (just role prompt, no workspace links) could still be useful for cross-session reference. Defer to Phase 3.
