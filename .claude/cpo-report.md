# CPO Report: Hooks & Non-Interactive Execution

## Summary

Implemented hooks and non-interactive execution for unattended local-agent jobs. Three problems solved:

1. **Print mode for Claude CLI** — `buildCommand()` now uses `claude -p "<task>"` which processes the task and exits (no interactive REPL blocking tmux sessions)
2. **Full-auto for Codex CLI** — `buildCommand()` now uses `codex --full-auto "<task>"` which completes and exits
3. **Permission hooks** — Ported and enhanced bash-gate.sh and file-tool-gate.sh from zazig v1 to prevent permission prompts from blocking unattended agents

## Files Changed

- `packages/local-agent/src/executor.ts` — Updated `buildCommand()` to use `-p` (print mode) for claude and `--full-auto` for codex
- `packages/local-agent/hooks/bash-gate.sh` — NEW: Auto-approves safe bash commands, blocks force push, git reset --hard, rm -rf outside safe targets, ~/.zazig/ access, production credentials
- `packages/local-agent/hooks/file-tool-gate.sh` — NEW: Auto-approves Read/Write/Edit/Grep/Glob except .env files and ~/.zazig/ directory
- `packages/local-agent/scripts/setup-hooks.sh` — NEW: Idempotent bootstrap script that installs hooks into ~/.claude/settings.json and sets up trust entries
- `.claude/cpo-report.md` — This report

## Setup Instructions

Machine owners must run the setup script once before their machine can execute unattended agent jobs:

```bash
cd packages/local-agent
./scripts/setup-hooks.sh
```

This will:
1. Copy hook scripts to `~/.claude/hooks/zazigv2/`
2. Merge PreToolUse hook entries into `~/.claude/settings.json` (existing settings preserved)
3. Add deny rules for destructive commands
4. Set up trust entries for `~/Documents/GitHub/` and `~/Documents/GitHub/.worktrees/`

Requires `jq` (`brew install jq`). Restart Claude Code after running.

## Pre-Merge Check

All checks passed (lint, typecheck). No test script configured.

## Token Usage

- Token budget: claude-ok (direct implementation)
- No codex-delegate used — task was straightforward and well-scoped
