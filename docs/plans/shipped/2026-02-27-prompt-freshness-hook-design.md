# Prompt Freshness Hook Design

**Date:** 2026-02-27
**Status:** Approved
**Author:** Claude (brainstormed with Tom)

## Problem

Persistent agent workspaces have a CLAUDE.md that's assembled at spawn time from the role prompt and personality in the DB. If the prompt is updated in the `roles` table between sessions, the agent continues using stale instructions until manually restarted.

## Solution

A SessionStart hook that detects role prompt changes and refreshes CLAUDE.md automatically.

## Design

### Shell Script: `packages/local-agent/scripts/check-prompt-freshness.sh`

**Fast path (no change):** 1 REST call + 1 hash comparison, ~50ms.

```
Read .role file → GET roles?name=eq.{role}&select=id,name,prompt → sha256 → compare .prompt-hash → exit 0
```

**Mismatch path:** 2 REST calls + file writes.

```
Fetch personality from exec_personalities → Reassemble CLAUDE.md → Update .prompt-hash → Warn on stderr
```

The script uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the daemon environment (already available). Dependencies: `curl`, `jq`, `shasum` (all present on macOS/Linux).

### Hash Scope

Hash covers `roles.prompt` only. Personality changes are rare and deliberate — typically accompanied by a full restart. Can be expanded later if needed.

### CLAUDE.md Assembly

Mirrors `handlePersistentJob` structure:

```
# ROLE_NAME (uppercase)
{personality compiled_prompt}    (if exists)

---

{role prompt}

---

{FILE_WRITING_RULES}
```

`FILE_WRITING_RULES` is stored in `.claude/.file-writing-rules` during workspace setup to avoid hardcoding TypeScript constants in shell.

### Workspace Metadata Files

Written by `handlePersistentJob` after `setupJobWorkspace` returns:

| File | Content | Purpose |
|------|---------|---------|
| `.role` | Role name (e.g. `cpo`) | Script reads to query DB |
| `.company-id` | Company UUID | Personality lookup |
| `.prompt-hash` | sha256 of `roles.prompt` at setup time | Comparison baseline |
| `.claude/.file-writing-rules` | `FILE_WRITING_RULES` constant | CLAUDE.md tail section |

### Hook Wiring

Added to `.claude/settings.json` by `handlePersistentJob`:

```json
{
  "permissions": { "allow": [...] },
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "bash /absolute/path/to/check-prompt-freshness.sh"
      }
    ]
  }
}
```

Script path resolved from repo root: `path.resolve(__dirname, '../scripts/check-prompt-freshness.sh')`.

### Scope

- **Persistent agents only.** Ephemeral jobs are one-shot and don't benefit from freshness checks.
- **`setupJobWorkspace` unchanged.** All persistent-specific files and hook config are written by `handlePersistentJob` after the base workspace setup.

## Files to Create/Modify

1. **Create:** `packages/local-agent/scripts/check-prompt-freshness.sh` — the hook script
2. **Modify:** `packages/local-agent/src/executor.ts` — `handlePersistentJob` writes metadata files and hook config
3. **Modify:** `packages/local-agent/src/workspace.ts` — export `FILE_WRITING_RULES` (currently used internally)

## Non-Goals

- Automatic agent restart on prompt change (warn only — user restarts)
- Personality freshness detection (role prompt only for v1)
- Ephemeral job freshness (not applicable)
