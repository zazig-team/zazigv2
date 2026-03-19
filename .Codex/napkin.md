# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-19 | self | `.Codex/napkin.md` was missing at session start | Ensure napkin exists immediately; create baseline file if absent before deeper work |

## User Preferences
- Keep responses concise and practical.

## Codebase Gotchas
- Repo includes strict skill routing in `AGENTS.md`; `napkin` is mandatory every session.

## Patterns That Work
- Use direct `cat` on user-provided paths when user likely wants file contents surfaced quickly.

## Patterns That Don't Work
- Delaying napkin initialization increases risk of missing persistent context.

## Domain Notes
- `zazigv2` is a cloud orchestrator + local agent daemon architecture using Supabase + Node + TypeScript.
