# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-19 | self | `.Codex/napkin.md` was missing at session start | Ensure napkin exists immediately; create baseline file if absent before deeper work |
| 2026-03-19 | self | Began file reads before confirming `.Codex/napkin.md` existed in this worktree | Check for `.Codex/napkin.md` first on session start; create immediately if missing |
| 2026-03-24 | self | Ran `git fetch origin +refs/heads/master:refs/remotes/origin/master` directly and hit `refusing to fetch into branch 'refs/heads/master'` because this repo's `origin` uses a nonstandard fetch refspec | In this repo, use `git fetch --refmap= origin <explicit-refspec>` when refreshing `refs/remotes/origin/*` to bypass the local `refs/heads/*:refs/heads/*` mapping |

## User Preferences
- Follow AGENTS skill triggers and file-safety constraints strictly.
- Keep responses concise and practical.
- User may send a file path directly to request file contents.

## Codebase Gotchas
- Orchestrator logic lives in `supabase/functions/orchestrator/index.ts` and contains multiple recovery passes in the heartbeat flow.
- Repo includes strict skill routing in `AGENTS.md`; `napkin` is mandatory every session.
- `.zazig-prompt.txt` enforces a strict machine-readable status-line format for `.claude/junior-engineer-report.md` in scoped tasks.
- `remote.origin.fetch` is set to `refs/heads/*:refs/heads/*`; explicit remote-tracking refreshes require `git fetch --refmap= origin ...` or fetch may try to update checked-out branches in sibling worktrees.

## Patterns That Work
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
