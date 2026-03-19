# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-19 | self | Began file reads before confirming `.Codex/napkin.md` existed in this worktree | Check for `.Codex/napkin.md` first on session start; create immediately if missing |

## User Preferences
- User may send a file path directly to request file contents.

## Codebase Gotchas
- `.zazig-prompt.txt` enforces a strict machine-readable status-line format for `.claude/junior-engineer-report.md` in scoped tasks.

## Patterns That Work
- Read skill instructions and target files in parallel to reduce turnaround time.

## Patterns That Don't Work
- Assuming persistent napkin presence across worktrees.

## Domain Notes
- `zazigv2` is a cloud orchestration server + local agent daemon architecture built with TypeScript and Supabase.
