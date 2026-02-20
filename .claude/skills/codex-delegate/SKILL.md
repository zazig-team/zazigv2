---
name: codex-delegate
description: This skill should be used when the user asks to "delegate to codex", "have codex do it", "use codex", "get a second implementation", "codex review", or when impartial code implementation or investigation from OpenAI Codex would be valuable. Also use when the user says "codex-delegate" or "/codex-delegate".
---

# Codex Delegate

Offload coding tasks to OpenAI Codex for impartial implementation or investigation. Codex runs in a sandboxed environment and returns structured results for review.

The `codex-delegate` CLI wrapper must be in `$PATH`. It wraps `codex exec`.

## Setup

Prerequisites for using this skill:

1. Install the OpenAI Codex CLI: `npm install -g @openai/codex`
2. Set the `OPENAI_API_KEY` environment variable
3. Place the `codex-delegate` script somewhere in `$PATH` (e.g. `~/.local/bin/`) and make it executable (`chmod +x`)
4. Copy this skill folder to `~/.claude/skills/codex-delegate/`

The default model is `gpt-5.3-codex`. To use a different model, pass `--model` or edit `DEFAULT_MODEL` in the script.

## Modes

### Implement Mode

Codex edits files in a `workspace-write` sandbox and returns a diff. Requires a clean git working tree (no uncommitted changes).

```bash
codex-delegate implement "Add input validation to the signup form"
```

### Investigate Mode

Codex reads only (`read-only` sandbox) and returns findings. No git requirements.

```bash
codex-delegate investigate "How does the auth middleware work?"
```

## Model Tiering

Control cost with `--reasoning` (`-r`). Not all tasks need max reasoning:

| Tier | Flags | Use For |
|------|-------|---------|
| Tier 1: Code | `-r xhigh` (default) | Implementation, complex refactors |
| Tier 2: Review | `-r medium` | Code review, test generation |
| Tier 3: Research | `-m gpt-5.2 -r default` | Investigation, summarization |

## Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--model` | `-m` | `gpt-5.3-codex` | Model to use |
| `--reasoning` | `-r` | `xhigh` | Reasoning effort: low, medium, high, xhigh |
| `--timeout` | `-t` | `300` | Timeout in seconds |
| `--dir` | `-d` | `$(pwd)` | Working directory |

## Workflow

### For `implement` tasks:

1. Ensure the git working tree is clean (commit or stash changes first)
2. Pass the working directory with `--dir` if not already in the right project
3. Run `codex-delegate implement "prompt"` via Bash
4. Review the structured output: CODEX OUTPUT, FILES CHANGED, DIFF, STATUS
5. Evaluate the diff critically — treat it as an external contribution
6. Help the user decide: keep, modify, or discard the changes

### For `investigate` tasks:

1. Run `codex-delegate investigate "prompt"` via Bash
2. Read Codex's findings from the output
3. Synthesize and present the findings to the user

## Examples

```bash
# Standard implementation
codex-delegate implement "Add input validation to the signup form"

# Investigation with lower reasoning (cheaper)
codex-delegate investigate -r medium "Review branch diff for security issues"

# Cross-project with explicit directory
codex-delegate implement --dir ~/Documents/GitHub/ink "Refactor the database layer"

# Research tier (cheapest)
codex-delegate investigate -m gpt-5.2 "Summarize what this module does"

# Long-running task with extended timeout
codex-delegate implement -t 600 "Refactor the entire auth module"
```

## Important Notes

- Implement mode requires a clean git working tree — commit or stash first
- Always pass `--dir` when the target project differs from the current working directory
- After reviewing Codex's changes, help the user decide: keep, modify, or discard
- Codex runs in a sandbox — it cannot access macOS Keychain, app preferences, running processes, or system extensions
- Treat Codex sandbox findings about macOS system state with skepticism (verify independently)
