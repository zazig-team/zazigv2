# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-19 | self | `.Codex/napkin.md` was missing at session start | Ensure napkin exists immediately; create baseline file if absent before deeper work |
| 2026-03-19 | self | Began file reads before confirming `.Codex/napkin.md` existed in this worktree | Check for `.Codex/napkin.md` first on session start; create immediately if missing |

## User Preferences
- Follow AGENTS skill triggers and file-safety constraints strictly.
- Keep responses concise and practical.
- User may send a file path directly to request file contents.

## Codebase Gotchas
- Orchestrator logic lives in `supabase/functions/orchestrator/index.ts` and contains multiple recovery passes in the heartbeat flow.
- Repo includes strict skill routing in `AGENTS.md`; `napkin` is mandatory every session.
- `.zazig-prompt.txt` enforces a strict machine-readable status-line format for `.claude/junior-engineer-report.md` in scoped tasks.
- `.zazig-prompt.txt` may contain strict output/commit contracts for the active job and should be treated as authoritative task context.

## Patterns That Work
- Read prompt file first, then inspect in-repo examples before drafting migrations.
- Use `rg` first to locate recovery functions, then patch the exact call chain.
- Use direct `cat` on user-provided paths when user likely wants file contents surfaced quickly.
- Read skill instructions and target files in parallel to reduce turnaround time.

## Patterns That Don't Work
- Skipping required always-on repo workflow files (like napkin) causes process drift.
- Delaying napkin initialization increases risk of missing persistent context.
- Assuming persistent napkin presence across worktrees.

## Domain Notes
- This repo orchestrates local/cloud agent execution; stale idea recovery must avoid duplicate expert sessions.
- `zazigv2` is a cloud orchestrator + local agent daemon architecture using Supabase + Node + TypeScript.
- Spec quality gates include path validity checks; breakdown flow can halt on invalid paths.
