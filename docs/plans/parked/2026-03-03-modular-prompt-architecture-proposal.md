# Modular Prompt Architecture

**Date:** 2026-03-03
**Status:** Proposal
**Author:** Tom + Claude

---

## Problem

### Today

Every exec agent's instructions are assembled by the orchestrator into a single concatenated string — personality prompt, role prompt, skills marker, task context, file-writing rules, completion instructions — and written by the local agent as one monolithic `CLAUDE.md` in the job workspace.

The orchestrator builds this in `dispatchQueuedJobs`:

```typescript
const promptParts: string[] = [];
if (personalityPrompt) promptParts.push(personalityPrompt);
if (rolePrompt) promptParts.push(rolePrompt);
promptParts.push(SKILLS_MARKER);
if (dispatchContext) promptParts.push(dispatchContext);
promptParts.push(FILE_WRITING_RULES);
promptParts.push(completionInstructions(job.role));
const promptStackMinusSkills = promptParts.join("\n\n---\n\n");
```

The local agent then writes this as a single file:

```typescript
writeFileSync(join(config.workspaceDir, "CLAUDE.md"), config.claudeMdContent);
```

### Which is a problem, because

1. **Context dilution at scale.** Role prompts are small today (~200–560 tokens each), but as execs mature — especially CPO, CTO, and specialist contractors — prompts will grow. Research ([arxiv.org/abs/2602.11988](https://arxiv.org/abs/2602.11988)) and practitioner experience confirm that models quietly ignore constraints buried deep in long instruction files. Attention is finite; more noise around the signal, softer the signal hits.

2. **Universal rules travel unnecessarily.** `FILE_WRITING_RULES` and `completionInstructions()` are hardcoded strings in the orchestrator edge function, identical for every role. They travel orchestrator → Realtime message → local agent → disk on every single dispatch. Editing them requires redeploying the orchestrator.

3. **No composability.** A client who wants to add their own constraints has no clean injection point. Everything is one opaque blob. There's no way to layer "our rules" + "client rules" + "role rules" without concatenation order games.

4. **Maintenance risk.** Every edit to universal rules touches the orchestrator. Fixing a file-writing rule could accidentally break completion behaviour. Blast radius = entire prompt for every role.

### What if?

Universal constraints loaded reliably via Claude Code's native `.claude/rules/` mechanism — individually authored, individually editable, and silently present in every agent's context without concatenation. The CLAUDE.md each agent sees contained only what's dynamic: who they are and what to do right now.

---

## Hypothesis

Claude Code's `.claude/rules/` directory (auto-loaded, same priority as root CLAUDE.md) gives us modular prompt loading for free. By storing prompt components as structured parts in Supabase and writing them as individual files in the workspace, we get better instruction adherence, cleaner separation of concerns, and a natural extension point for client-specific rules — without changing the control plane.

---

## Therefore

Split the monolithic prompt string into structured parts at the DB level, send them as structured data in dispatch messages, and have the local agent write them as individual `.claude/rules/` files alongside a lean CLAUDE.md.

---

## How this would work

### 1. Supabase Schema Change

Add a `rules` JSONB column to the `roles` table (or a separate `prompt_rules` table if we want per-company overrides later):

```sql
ALTER TABLE roles ADD COLUMN rules jsonb DEFAULT '{}';
```

Seed it with the universal rules that currently live as hardcoded strings in the orchestrator:

```sql
UPDATE roles SET rules = jsonb_build_object(
  'hard-walls', 'Never commit secrets or credentials...',
  'file-writing', '... (current FILE_WRITING_RULES content) ...',
  'completion', '... (current completionInstructions content) ...'
);
```

Role-specific rules can also move here. The `prompt` column stays — it's the role identity and always belongs in CLAUDE.md.

### 2. Orchestrator Changes

The orchestrator stops concatenating universal rules into the prompt string. Instead, it reads `roles.rules` and sends them as a structured field in the dispatch message:

```typescript
// Before:
promptParts.push(FILE_WRITING_RULES);
promptParts.push(completionInstructions(job.role));
const promptStackMinusSkills = promptParts.join("\n\n---\n\n");

// After:
const claudeMd = promptParts.join("\n\n---\n\n"); // just personality + role + task
const rules = roleRow.rules ?? {};
// Send both in the dispatch message
```

The `StartJob` message type gets a new optional field:

```typescript
interface StartJob {
  // ... existing fields ...
  rules?: Record<string, string>;  // key → markdown content
}
```

### 3. Local Agent Changes

`setupJobWorkspace()` gains a new step — writing `.claude/rules/` files from the dispatch message:

```typescript
// New step between settings.json and skills injection:
if (config.rules) {
  const rulesDir = join(claudeDir, "rules");
  mkdirSync(rulesDir, { recursive: true });
  for (const [name, content] of Object.entries(config.rules)) {
    writeFileSync(join(rulesDir, `${name}.md`), content);
  }
}
```

The `.gitignore` block in `setupJobWorkspace()` already covers `.claude/` so rules files won't leak into commits.

### 4. Resulting Workspace Layout

```
workspace/
├── CLAUDE.md                    ← lean: personality + role identity + task context
├── .mcp.json
├── .claude/
│   ├── settings.json
│   ├── rules/                   ← auto-loaded by Claude Code
│   │   ├── hard-walls.md
│   │   ├── file-writing.md
│   │   └── completion.md
│   └── skills/
│       └── jobify/
│           └── SKILL.md
```

Claude Code loads `CLAUDE.md` + everything in `.claude/rules/` at startup. No routing logic. No path triggers. It just works.

### 5. Client Extension Point (Future)

If a client repo already has `.claude/rules/` files (their own coding standards, naming conventions, etc.), those layer naturally on top of ours. For worktree-based code jobs, the client's rules come from their repo, our rules get overlaid by `setupJobWorkspace()`. No conflicts — Claude Code merges all rules files.

This is a free benefit of using the native mechanism rather than our own concatenation.

### 6. Migration Path

This is backward-compatible:

1. Add `rules` column to `roles` table (default `{}`)
2. Populate it with current hardcoded strings from orchestrator
3. Update orchestrator to read `rules` and send in dispatch
4. Update local agent to write `.claude/rules/` files
5. Remove hardcoded `FILE_WRITING_RULES` and `completionInstructions()` from orchestrator
6. Update `@zazigv2/shared` `StartJob` type

Steps 1–4 can ship together. Step 5 is the cleanup once we've confirmed it works. No existing behaviour changes until step 5.

### What this does NOT change

- **Skills** — stay as-is, already modular
- **Personality prompts** — stay in CLAUDE.md (role-specific, always relevant)
- **Role prompts** — stay in CLAUDE.md (the `prompt` column doesn't move)
- **Task context** — stays in CLAUDE.md (it's the job, always relevant)
- **MCP config, settings, permissions** — untouched

---

## We propose

Store universal prompt rules as structured data in Supabase, send them as a typed `rules` field in dispatch messages, and have the local agent write them as individual `.claude/rules/` files — leveraging Claude Code's native auto-loading instead of string concatenation. This keeps all prompt content in the orchestration layer (not in client repos), makes rules individually editable without redeploying edge functions, and creates a natural extension point for client-specific constraints.
