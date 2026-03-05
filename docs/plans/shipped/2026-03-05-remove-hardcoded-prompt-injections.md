# Remove Hardcoded Prompt Injections

**Date:** 2026-03-05
**Status:** Ready to implement
**Owner:** Tom (manual)

## Problem

Two blocks of instructions are hardcoded as string constants in compiled TypeScript and injected into every agent's CLAUDE.md at runtime:

1. **`FILE_WRITING_RULES`** — duplicated in `executor.ts` and `orchestrator/index.ts`. Tells agents to keep all files in "your working directory", which is ambiguous: the workspace (`~/.zazigv2/...-workspace/`) is the working directory, but docs should go in the repo. This is why the CTO keeps writing docs to `.claude/cto-report.md` instead of `docs/` in the repo.

2. **`CODEX_ROUTING_INSTRUCTIONS`** — in `executor.ts`. Forces all non-codex agents to use `codex-delegate` for code changes. Outdated now that codex-delegate is a skill roles can opt into.

Both require a rebuild to change. Everything else (personality, company context, role prompt) is table-driven and editable via migration.

## Solution

### Part 1: Rewrite file writing rules into role prompts (migration)

Add a clear `## File Writing` section to the CPO and CTO role prompts that distinguishes between:
- **Session state** (reports, napkin) → workspace (`.claude/{role}-report.md`)
- **Durable knowledge** (docs, plans, research, specs, proposals) → repo (`docs/plans/`, `docs/research/`, etc.)

New sections to append to **both** prompts:

```
## File Writing

Two locations, two purposes:

- **Session reports** → `.claude/{role}-report.md` in your workspace. This is ephemeral session state.
- **Documents, plans, specs, research, proposals** → `docs/` in the zazigv2 repo (e.g. `docs/plans/YYYY-MM-DD-slug.md`, `docs/research/YYYY-MM-DD-slug.md`). This is durable team knowledge that persists in git.

Never write durable documents to your workspace — they won't be committed or seen by others.
Never use absolute paths to other users' machines. Use paths relative to the repo root.

## Staging & Production (March 2026)

Two separate environments. Production only changes when explicitly promoted.

- `zazig start` = production (bundled .mjs, frozen until promoted)
- `zazig-staging start` = staging (live working tree, auto-updates on push to master)
- `zazig promote` = copies staging → production (edge functions, migrations, agent bundle)
- Staging has its own Supabase instance (separate DB, separate edge functions)

**Pipeline merges to master → staging auto-updates → test on staging → promote when ready.**

Small safe changes (new MCP tool, config tweak): test once, promote fast.
Big structural changes (daemon, orchestrator): batch up, test thoroughly, then promote.

CPO runs on production. New MCP tools/features won't be available to production
until promoted. Don't reference tools or capabilities that only exist on staging.
```

### Part 2: Remove hardcoded constants (code change)

**`packages/local-agent/src/executor.ts`:**
- Delete `CODEX_ROUTING_INSTRUCTIONS` constant (~lines 139-150)
- Delete `FILE_WRITING_RULES` constant (~lines 152-160)
- Delete the export keyword on `FILE_WRITING_RULES` (if anything imports it — check first)
- Delete `writeFileSync(join(workspaceDir, ".claude", ".file-writing-rules"), FILE_WRITING_RULES)` (line 1030)
- Delete the line that appends `CODEX_ROUTING_INSTRUCTIONS` to assembled context (~line 2196)

**`supabase/functions/orchestrator/index.ts`:**
- Delete `FILE_WRITING_RULES` constant (~lines 79-86)
- Delete `promptParts.push(FILE_WRITING_RULES)` (line 849)

**`supabase/functions/company-persistent-jobs/index.ts`:**
- Delete `FILE_WRITING_RULES` constant (~lines 31-37)
- Delete `parts.push(FILE_WRITING_RULES)` (line 158)

### Part 3: Fix CTO report path bug (while we're in there)

The CTO prompt (set in migration 012) still says `.claude/cpo-report.md`. Fix to `.claude/cto-report.md`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/115_file_writing_rules_to_prompts.sql` | New migration: update CPO + CTO prompts with file writing section + fix CTO report path |
| `packages/local-agent/src/executor.ts` | Remove `FILE_WRITING_RULES`, `CODEX_ROUTING_INSTRUCTIONS`, related writes and pushes |
| `supabase/functions/orchestrator/index.ts` | Remove `FILE_WRITING_RULES` constant and push |
| `supabase/functions/company-persistent-jobs/index.ts` | Remove `FILE_WRITING_RULES` constant and push |

## Verification

After deploying:
1. Start a CPO session — CLAUDE.md should NOT contain "Codex Delegation" or the old "File Writing Rules" block
2. CLAUDE.md SHOULD contain the new "File Writing" section (from role prompt)
3. Ask CPO to write a plan doc — should go to `docs/plans/` in the repo, not workspace
4. Ask CTO to write a review — report to workspace, docs to repo

## Risk

Low. Removing dead constants. The new rules are clearer and match actual practice. Migration is additive (appends to existing prompts). Rollback: revert migration + re-add constants.
