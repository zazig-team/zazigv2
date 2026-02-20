# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-02-20 | Doppler secrets | Searched `--config dev` and found no Supabase keys. Keys are in `--config prd`. | Always check `prd` config first for zazig project in Doppler |

## User Preferences
- TypeScript for both orchestrator and local agent
- Supabase for state, realtime, and orchestrator hosting
- No Trello — job queue lives in Supabase Postgres
- Credential scrubbing must be built in from day one

## Codebase Gotchas

## Patterns That Work

## Patterns That Don't Work

## Domain Notes
- Replaces zazig v1's VP-Eng, Supervisor, watchdog, and launch scripts
- CPO is the only persistent agent — all others are ephemeral and card-driven
- Collaborative instance: Tom Weaver + Chris Evans
- Resource pool: Tom (2 Claude Code + 1 Codex), Chris (1 Claude Code + 1 Codex)
- Design doc: docs/plans/2026-02-18-orchestration-server-design.md
- Spacebot/ZeroClaw analysis: referenced in zazig v1 repo at docs/plans/2026-02-18-zazig-evolution-spacebot-zeroclaw.md
