# Startup Preflight Checks

**Date:** 2026-03-28
**Status:** Approved
**Author:** CPO

## Problem

`zazig start` has minimal prerequisite checks — only `claude` (hard) and `codex` (soft). Other required tools like `git`, `tmux`, and `gh` are not checked. An outdated git version (below 2.29) caused runtime failures that were hard to diagnose.

## Solution

Add a `preflight.ts` module with declarative prerequisite checks that run before anything else in `zazig start`. All failures are collected and shown at once so the user can fix everything in one pass.

## Design

### Module: `packages/cli/src/lib/preflight.ts`

Declarative prerequisites list:

| Tool | Min Version | Required | Install Hint |
|------|------------|----------|-------------|
| `git` | 2.29 | Yes | `brew install git` |
| `tmux` | — | Yes | `brew install tmux` |
| `gh` | — | Yes | `brew install gh` |
| `claude` | — | Yes | `npm install -g @anthropic-ai/claude-code` |
| `codex` | — | No (soft) | `npm install -g @openai/codex` |

### `runPreflight()` function

1. Iterate through prerequisites
2. Run `<bin> --version` for each
3. Parse semver from output via regex (`/(\d+\.\d+(\.\d+)?)/`)
4. Compare against `minVersion` if set (numeric major.minor.patch comparison)
5. Collect all failures into an array
6. If any **required** tool fails → print all failures in one block, exit 1
7. If only **optional** tools fail → print warnings, return status info

Returns: `{ codexInstalled: boolean }` (extensible for future optional tools).

### Failure output format

```
Preflight failed:

  ✗ git 2.13.0 found, minimum 2.29 required
    → brew install git

  ✗ tmux not found
    → brew install tmux

Please fix the above and re-run zazig start.
```

### Changes to `start.ts`

- Remove existing inline `claude --version` and `codex --version` checks
- Add `const preflight = await runPreflight()` as the first call in `start()`
- Use `preflight.codexInstalled` where `codexInstalled` is currently used

### Version parsing

Simple regex + numeric comparison. No semver library needed — we only compare against one known minimum per tool.
