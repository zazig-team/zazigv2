# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-02-20 | Doppler secrets | Searched `--config dev` and found no Supabase keys. Keys are in `--config prd`. | Always check `prd` config first for zazig project in Doppler |
| 2026-02-20 | Trello access | Said "I don't have Trello API access" when Trello API key + token are in Doppler and have been used extensively. | Always check Doppler for Trello creds. Full Trello API access across both workspaces. Using "Trello Lite" pattern. |
| 2026-02-24 | Supabase migrations | Tried `supabase db push`, `supabase db execute --file` — neither works (migration history mismatch, no --file flag). Wasted time looking for auth that was in Doppler. | Use Management API: `curl -X POST https://api.supabase.com/v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN` from Doppler (zazig/prd). Works for all SQL including DDL. |

## User Preferences
- TypeScript for both orchestrator and local agent
- Supabase for state, realtime, and orchestrator hosting
- Job queue lives in Supabase Postgres (not Trello)
- Trello for project/task management — full API access via Doppler (zazig/prd). Using "Trello Lite" pattern.
- Credential scrubbing must be built in from day one

## Codebase Gotchas
- Spelling: "canons" not "cannons", "Zazig" not "ZeZig/Zezig", "pillar" not "lens", "Supabase" not "SuperBase/super base"
- Chris = Speaker 2 in meeting transcripts (transcription tool keeps re-labelling him as Speaker 11/12/13/14 too)
- Every Supabase edge function needs its own `deno.json` with `"@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"` import map — bare imports don't work in Deno runtime
- Deploy edge functions: `SUPABASE_ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN --project zazig --config prd --plain) npx supabase functions deploy <name> --no-verify-jwt --project-ref jmussmwglgbwncgygzbz`
- Jobs table has `context` column (not `spec`) for the task description — jobify `spec` field maps to `context` in DB

## Patterns That Work
- Running migrations: Use Supabase Management API (`POST https://api.supabase.com/v1/projects/jmussmwglgbwncgygzbz/database/query`) with `SUPABASE_ACCESS_TOKEN` from Doppler. `supabase db push` doesn't work due to migration history mismatch with numbered naming convention.
- Documentation reconciliation as an explicit planning activity — iterating across existing docs to build clarity before structuring into features
- Contractor Pattern: skill (reasoning/decomposition brain) + role-scoped MCP (typed DB writes hands) — replicable across contractor roles
- CPO Knowledge Architecture: lean routing prompt (~200 tokens permanent) + stage-specific skills (load on demand) + doctrines (proactively injected beliefs). Avoids 2000+ token permanent context cost.
- Skill-to-role/stage mapping as an explicit section in design docs — clarifies what the orchestrator must assemble at dispatch time and what machines need installed

## Patterns That Don't Work

## Domain Notes
- Replaces zazig v1's VP-Eng, Supervisor, watchdog, and launch scripts
- CPO is the only persistent agent — all others are ephemeral and card-driven
- Collaborative instance: Tom Weaver + Chris Evans
- Resource pool: Tom (2 Claude Code + 1 Codex), Chris (1 Claude Code + 1 Codex)
- Design doc: docs/plans/2026-02-18-orchestration-server-design.md
- Spacebot/ZeroClaw analysis: referenced in zazig v1 repo at docs/plans/2026-02-18-zazig-evolution-spacebot-zeroclaw.md
