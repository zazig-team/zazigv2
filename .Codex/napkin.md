# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences
- Follow AGENTS skill triggers and file-safety constraints strictly.

## Codebase Gotchas
- Orchestrator logic lives in `supabase/functions/orchestrator/index.ts` and contains multiple recovery passes in the heartbeat flow.

## Patterns That Work
- Use `rg` first to locate recovery functions, then patch the exact call chain.

## Patterns That Don't Work
- Skipping required always-on repo workflow files (like napkin) causes process drift.

## Domain Notes
- This repo orchestrates local/cloud agent execution; stale idea recovery must avoid duplicate expert sessions.
