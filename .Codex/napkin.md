# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-19 | self | Assumed `.Codex/napkin.md` already existed in this worktree | Always create `.Codex/napkin.md` immediately if missing before task work |

## User Preferences
- When given a file path containing task instructions, execute the task directly in the current worktree.

## Codebase Gotchas
- `.zazig-prompt.txt` may contain strict output/commit contracts for the active job and should be treated as authoritative task context.

## Patterns That Work
- Read prompt file first, then inspect in-repo examples before drafting migrations.

## Patterns That Don't Work
- Starting task edits before checking whether required session memory files exist.

## Domain Notes
- Spec quality gates include path validity checks; breakdown flow can halt on invalid paths.
