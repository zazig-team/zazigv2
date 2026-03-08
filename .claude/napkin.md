# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-03-03 | docs/plans directory | Assumed design docs were at `docs/plans/*.md` but they are organized into subdirectories: `active/`, `shipped/`, `archived/`, `parked/`. Only one file sits at root level. | Always check `docs/plans/active/` and `docs/plans/shipped/` for the canonical design docs. New standalone docs can go at `docs/plans/` root. |
| 2026-03-03 | Idea-feature link | Assumed no DB link between ideas and features existed, told user we'd need a migration. Actually, ideas table already has `promoted_to_type`, `promoted_to_id`, `promoted_at` columns + a `query-idea-status` edge function that traces the full chain. | Check edge functions and do `SELECT *` from the table before assuming columns don't exist — migrations may not capture all schema changes (some done via direct ALTER). |
| 2026-02-20 | Doppler secrets | Searched `--config dev` and found no Supabase keys. Keys are in `--config prd`. | Always check `prd` config first for zazig project in Doppler |
| 2026-02-20 | Trello access | Said "I don't have Trello API access" when Trello API key + token are in Doppler and have been used extensively. | Always check Doppler for Trello creds. Full Trello API access across both workspaces. Using "Trello Lite" pattern. |
| 2026-02-24 | Supabase migrations | Tried `supabase db push`, `supabase db execute --file` — neither works (migration history mismatch, no --file flag). Wasted time looking for auth that was in Doppler. | Use Management API: `curl -X POST https://api.supabase.com/v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN` from Doppler (zazig/prd). Works for all SQL including DDL. |
| 2026-03-05 | GoTrue redirect_to | Put `redirect_to` in POST body of `/auth/v1/magiclink` — GoTrue silently ignored it. Wasted hours debugging wildcard matching. | GoTrue reads `redirect_to` as a **query parameter**, not body field. Match how `@supabase/supabase-js` sends it. |
| 2026-03-05 | CLI release bundle | Changed `login.ts`, rebuilt with `npm run build`, but `zazig` still ran old code. | `zazig` binary points to `releases/zazig.mjs` (esbuild bundle), not `dist/`. Must run `node scripts/bundle.js` after tsc build. Always commit the rebuilt bundle. |
| 2026-03-05 | Supabase OTP length | Assumed OTP is always 6 digits, hardcoded in UI. Staging sends 8-digit codes. | Never hardcode OTP length. Different Supabase instances can have different `GOTRUE_MAILER_OTP_LENGTH` defaults. |
| 2026-03-05 | Edge function JWT | Spent hours debugging "Invalid JWT" errors from browser. Assumed token was expired/stale. Actual cause: all edge functions had `verify_jwt=true` (CI deploy didn't use `--no-verify-jwt`). Gateway rejected JWT before function code ran. | Always check `verify_jwt` setting via Management API (`GET /v1/projects/{ref}/functions`) before debugging JWT issues. CI deploys may overwrite `--no-verify-jwt`. |
| 2026-03-05 | WebUI all-zeros diagnosis | Chased auth token race conditions, JWT expiry, Promise.all vs allSettled — none were the root cause. The real issue was a deploy config problem (verify_jwt). | When edge functions fail from browser but work via curl, first check the function's `verify_jwt` setting. Don't assume code-level auth bugs. |
| 2026-03-06 | Pipeline empty columns | Told user Proposal/Complete empty was "correct" without investigating deeply enough. User knew features should be there. Turned out 7 features were bulk-failed at 2026-03-05 01:15 UTC by an unknown process (no events logged). | When user says data is missing, investigate the DB history (updated_at timestamps, event logs) before concluding it's "by design". Unexplained bulk state changes = incident, not normal. |
| 2026-03-06 | Triage card colors | Changed triage column dot color but forgot to change triage card accent strips — they still used `ideaAccentColor()` which returned amber for idea-type items. | When changing column colors, update both the column header dot AND the card accent strips. Test visually after deploying. |
| 2026-03-07 | Ideas table columns | Used `body` column name — doesn't exist. Correct column is `raw_text`. | Query an existing row first (`SELECT * FROM ideas LIMIT 1`) before assuming column names. |
| 2026-03-07 | Ideas source constraint | Used `human` as source value — not valid. CHECK constraint allows: `terminal, slack, telegram, agent, web, api, monitoring`. | Always check CHECK constraints before inserting. Use `web` for human-originated ideas. |
| 2026-03-08 | Seed migration LIMIT 1 | Seed migration used `SELECT id FROM companies LIMIT 1` to get "the" company. On production, `LIMIT 1` without `ORDER BY` returned "Test Co" instead of "zazig-dev". Capabilities were seeded under the wrong company. RLS correctly blocked them — spent hours debugging RLS when the data was the problem. | Never use `LIMIT 1` without `ORDER BY` or `WHERE` on multi-row tables. For seed data targeting a specific company, use `WHERE name = 'zazig-dev'` or `WHERE id = '00000000-...'`. When RLS returns 0 rows, check the actual `company_id` values in the data FIRST — don't assume the data is correct. |
| 2026-03-08 | Supabase migration naming | Renamed an already-applied migration (123→125). Remote had the old name in `schema_migrations`, causing `supabase db push` to fail with "not found locally". | NEVER rename or modify already-applied migrations. Create new remediation migrations instead. Migration filenames are tracked by Supabase and renaming breaks the history match. |
| 2026-03-08 | CTE snapshot isolation | Migration 122 inserted lanes + capabilities in the same WITH statement. The capabilities INSERT joined `all_lanes` which couldn't see freshly inserted lanes (CTE snapshot isolation). | Data-modifying CTEs in the same WITH share the same snapshot. One CTE cannot see rows inserted by another CTE. Split into separate statements or separate migrations. |

## User Preferences
- TypeScript for both orchestrator and local agent
- Supabase for state, realtime, and orchestrator hosting
- Job queue lives in Supabase Postgres (not Trello)
- Trello for project/task management — full API access via Doppler (zazig/prd). Using "Trello Lite" pattern.
- Credential scrubbing must be built in from day one
- Very visual — prefers interactive visualizations (tech trees, diagrams) over text-based status reports
- Prefers relational tables over JSONB columns for queryable data (chose `machine_backends` table over JSONB on machines)
- Detail panel text should be compact — body text at 11.5px not 12px. Don't let large paragraphs dominate the panel. Structured bullets > prose.
- Wants to see "what was built" — Shipped section on Ideas page, feature status badges on promoted ideas. The trail from idea → feature → completion matters.

## Codebase Gotchas
- Spelling: "canons" not "cannons", "Zazig" not "ZeZig/Zezig", "pillar" not "lens", "Supabase" not "SuperBase/super base"
- Chris = Speaker 2 in meeting transcripts (transcription tool keeps re-labelling him as Speaker 11/12/13/14 too)
- Every Supabase edge function needs its own `deno.json` with `"@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"` import map — bare imports don't work in Deno runtime
- Deploy edge functions: `SUPABASE_ACCESS_TOKEN=$(doppler secrets get SUPABASE_ACCESS_TOKEN --project zazig --config prd --plain) npx supabase functions deploy <name> --no-verify-jwt --project-ref jmussmwglgbwncgygzbz`
- Jobs table has `context` column (not `spec`) for the task description — jobify `spec` field maps to `context` in DB
- Orchestrator tests: env vars MUST be set via CLI (`SUPABASE_URL=... deno test`), NOT just `Deno.env.set()` in the test file — ES module static imports are hoisted above all code, so the module loads before env vars are set
- Orchestrator test mock (`createSmartMockSupabase`): does NOT support `insert().select()` or double `.eq().eq()` chains — 6 pre-existing test failures from this limitation
- `triggerBreakdown` role is `breakdown-specialist` (not `feature-breakdown-expert` or `tech-lead`)
- Always check highest existing migration number with `ls supabase/migrations/` before naming — plan said 045/046 but 045 was already taken (features_priority), so actual was 046/047
- `verification_type` column on features — `'passive'` (default, existing reviewer) or `'active'` (verification-specialist contractor)
- `CardType` in shared/messages.ts must match DB `job_type` constraint — if you add a new job_type to the DB, also add it to the TS type and `isStartJob` validator. Missing `"verify"` caused jobs to be silently rejected by the local-agent.
- Long prompts exceed OS `ARG_MAX` if passed as `claude -p "<context>"` CLI arg — must pipe via `cat .zazig-prompt.txt | claude --model X -p` instead. The `-p` flag must be last (reads stdin).
- Executor report path: agent writes `.claude/cpo-report.md` relative to workspace CWD (`~/.zazigv2/job-<id>/`), not `$HOME`. Executor checks workspace dir first, falls back to `$HOME`.
- `batch-create-jobs` temp reference format is `temp:N` (colon), not `temp-N` (dash)
- `assembled_context` column doesn't exist on jobs table yet — the executor's DB write fails silently (non-blocking)

## Patterns That Work
- Capability detail panel content: don't repeat the panel title as a `## Heading` in the markdown body (redundant). Don't end with a large status summary paragraph — the tooltip + badges handle that. Just structured bullet points.
- Populating DB content at scale: write a Python script with `urllib.request` to PATCH via Supabase REST API. Faster than individual curl commands. Use `Prefer: return=minimal` header.
- Parallel subagent research: dispatch 4 Explore agents covering 7-8 items each, then batch-write results. Research agents find design docs, migrations, and code; main agent synthesizes into concise summaries.
- Ideas page: separate fetch for promoted ideas (`fetchIdeas(companyId, ['promoted'])`) ensures shipped section always populated regardless of main query limit.
- Idea interface TypeScript fields must match what `query-ideas` returns (`SELECT *`). If the DB has columns the TS interface lacks, extend the interface — don't assume missing fields don't exist.
- Running migrations: Use Supabase Management API (`POST https://api.supabase.com/v1/projects/jmussmwglgbwncgygzbz/database/query`) with `SUPABASE_ACCESS_TOKEN` from Doppler. `supabase db push` doesn't work due to migration history mismatch with numbered naming convention.
- Documentation reconciliation as an explicit planning activity — iterating across existing docs to build clarity before structuring into features
- Contractor Pattern: skill (reasoning/decomposition brain) + role-scoped MCP (typed DB writes hands) — replicable across contractor roles
- CPO Knowledge Architecture: lean routing prompt (~200 tokens permanent) + stage-specific skills (load on demand) + doctrines (proactively injected beliefs). Avoids 2000+ token permanent context cost.
- Skill-to-role/stage mapping as an explicit section in design docs — clarifies what the orchestrator must assemble at dispatch time and what machines need installed

## Patterns That Don't Work
- Assuming pipeline columns are empty = bug. Check the DB first — `refresh_pipeline_snapshot` RPC excludes `complete` and `cancelled` from `features_by_status` (they go to `completed_features` → Shipped). Empty columns may be genuinely empty.
- Embedding live file reads into static HTML (file:// protocol blocks fetch). Bake content in as static data instead.
- Trying to read 20+ design docs into context at once — hits token limits. Summarize and embed.

## Design Doc Patterns
- Design docs in `docs/plans/` are organized by status: `active/`, `shipped/`, `archived/`, `parked/`
- **Always date-prefix files** (`2026-MM-DD-name.md`) and put them in the appropriate subdirectory (usually `active/`). Never dump undated files in `docs/plans/` root.
- Group related docs in a subfolder within `active/` if there are 3+ files (e.g., `active/webui/` for all WebUI prompts and design docs)
- Design doc format: Title, Date, Status, Authors, Part of ORG MODEL, Companion docs. Then: Problem, Architecture, Integration, Implementation Plan, Open Questions, Appendices
- Cross-reference other docs by relative path from the plans directory (e.g., `active/2026-02-22-exec-knowledge-architecture-v5.md`)
- Memory system design: `docs/plans/active/2026-03-03-memory-system-design.md` (in active subdirectory, v3 — includes Procedure type, tier-specific budgets, mandatory slot reservation, hardened Context Handoff Protocol)

## WebUI Status (2026-03-03)
- **Vercel prod (`zazigv2-webui`, www.zazig.com) does NOT auto-deploy from master** — `dashboard` and `zazigv2-webui-staging` do, but prod requires manual deploy: `cd zazigv2 && npx vercel --prod`
- Old Netlify deploy (decommissioned): `cd zazigv2 && npx netlify deploy --prod --dir=packages/webui/dist --site dc0c201a-c481-4724-8b07-40e089f3b6d4 --filter @zazig/webui`
- Phase 1 complete: auth, landing, login, dashboard, pipeline, team — all read-only, connected to live Supabase
- Phase 2 complete (Codex): Realtime subscriptions, archetype picker write-back, theme persistence, goal progress, focus area health
- Phase 3 SQL done: `decisions` + `action_items` tables, RLS, Realtime publication, `features` added to Realtime, `ideas` SELECT policy
- CLI login: dual-mode — auto (magic link + OTP fallback), `--otp` (code only), `--link` (link only). Magic link uses localhost callback with `redirect_to` as query param.
- Supabase auth (prod): `site_url` set to `https://zazig.com`. WebUI on Vercel (`www.zazig.com` prod, `zazigv2-webui-staging.vercel.app` staging).
- CLI release bundle: `zazig` binary runs from `releases/zazig.mjs` (esbuild), NOT `dist/`. Must run `node scripts/bundle.js` after `npm run build` and commit the bundle.
- Logo: zazig green dot must always align to baseline of "g" (not centered)
- Landing slogan: "Your autonomous startup that scales while you sleep."

## Pipeline Data Incidents
- **2026-03-05 01:15 UTC**: 7 features bulk-failed at exact same second (Auto-greenlight, Automated focus area health, Bidirectional Messaging, Build Pipeline: Test & Ship, Persistent Agent Identity, Role Launch Order, Triggers/Events/Wake). No events logged — likely direct DB update, not orchestrator.
- **2026-03-01 21:33 UTC**: 3 features bulk-cancelled (Idea Visualiser, Persistent Agent Bootstrap Parity, Pipeline smoke test static health).
- **2026-03-02 09:10-09:19 UTC**: 3 more cancelled (Pipeline Smoke Test, Scheduler/Hooks/External Triggers, Web UI Pipeline Visibility).
- As of 2026-03-06: all 84 features are terminal (45 failed, 33 complete, 6 cancelled). Zero in proposal/building/verifying on both prod and staging.
- Staging ref: `ciksoitqfwkgnxxtkscq`, Doppler config: `stg`. Management API returns "Forbidden resource" — use REST API with service role key instead.

## Playwright MCP Gotchas
- Chrome singleton lock: if Chrome is already open, Playwright MCP fails with "Opening in existing browser session" + exit. User must close Chrome first, or remove the SingletonLock file at `~/Library/Caches/ms-playwright/mcp-chrome-*/SingletonLock`.
- Staging Vercel previews may not have auth cookies — navigate to prod (`zazig.com`) for authenticated page testing.
- Daemon crash logs can be stale — check job status in DB before concluding daemon is down. If jobs are executing, daemon is alive.

## Daemon Deployment Process
- Executor/daemon code changes need to be shipped to master, then promoted (1x daily promote cycle), then daemon restarted.
- Edge function changes deploy immediately via `supabase functions deploy`.
- Don't confuse "built locally" with "live on daemon" — local build + bundle is NOT deployed until promote.

## WebUI Codebase Gotchas
- CSS Grid overflow: always use `minmax(0, 1fr)` not bare `1fr` — bare `1fr` defaults to `minmax(min-content, 1fr)` and prevents columns from shrinking below content width
- `.main` needs `overflow: hidden` + `min-width: 0` to clip content within grid cell
- Netlify deploy from monorepo: must use `--filter @zazig/webui` flag, deploy from repo root, not from packages/webui
- Pipeline statuses in DB: `created`, `ready_for_breakdown`, `breakdown`, `building`, `combining`, `verifying`, `pr_ready`, `complete`, `cancelled`, `failed`
- `refresh_pipeline_snapshot` RPC: `features_by_status` excludes `complete` and `cancelled` — complete goes to `completed_features` (maps to Shipped in UI), cancelled is omitted entirely. The `complete` pipeline column will always be empty by design.
- Pipeline color scheme (dark mode): ideas=amber, briefs=blue, bugs=red, tests=purple, triage=sage green. Defined in `tokens.css`, no longer overridden in `global.css`.
- Idea statuses in DB: `new`, `triaged`, `workshop`, `parked`, `promoted`, `rejected`, `done`
- Ideas page sections: Workshop (status=workshop), Triaged (status=triaged), Inbox (status=new), Parked (status=parked, split by horizon), Shipped (status=promoted, fetched separately with linked feature statuses)
- Idea `Idea` TS interface includes `promoted_to_type`, `promoted_to_id`, `promoted_at` — must keep in sync with DB columns
- Idea-to-feature linking: lives on the **ideas** table — `promoted_to_type` ("feature"|"job"|"research"), `promoted_to_id` (UUID), `promoted_at` (timestamp). No FK on features table. Reverse lookup: `SELECT FROM ideas WHERE promoted_to_type='feature' AND promoted_to_id=<featureId>`
- Features have `pr_url` column (migration 072) — use this as primary PR link, fall back to job `pr_url`
- Features have `spec` and `acceptance_tests` text columns (migration 008) — check `spec` to determine "Specced" vs "Needs spec" badge
- Ideas have many unused columns: `scope`, `complexity`, `domain`, `autonomy`, `tags`, `flags`, `clarification_notes`, `source`, `source_ref`, `suggested_exec`, `project_id`
- Features have unused columns: `error` (failure reason), `human_checklist`
- Jobs have unused columns: `rejection_feedback`, `blocked_reason`, `verify_context`

## WebUI Pipeline Actions (2026-03-08)
- Ideas detail panel: "Promote to Feature" button for triaged/workshop ideas. Readiness checks: title, description, project. Calls `promote-idea` edge function.
- Roadmap detail panel: "Plan & Build" button for active/draft capabilities. Gated on deps satisfied. Calls `request-work` with role=project-architect. PA runs featurify skill to decompose into features.
- Both reuse `promote-section` CSS classes (promote-readiness, promote-check, promote-btn, promote-success, promote-error).
- `fetchProjects()` and `commissionProjectArchitect()` in queries.ts.
- Capabilities map to the zazigv2 project (not separate projects per capability).
- PA job picked up in seconds when daemon is running — pipeline is fast.
- Pipeline detail panel: "Diagnose & Retry" section for failed features. Async agent-based diagnosis: `diagnose-feature` edge function gathers all data (feature, jobs, job_logs), commissions Sonnet agent. UI polls `fetchJobResult` every 4s.
- `requestFeatureFix()`, `diagnoseFeature()`, `fetchJobResult()` in queries.ts. `FeatureDetailJob` now includes `result`, `FeatureDetail` includes `error`.
- **Critical**: `request-feature-fix` must cancel old failed jobs (step 3b) AND clear feature `error` column. Without this, orchestrator catch-up (Task 0) sees old failed jobs on the now-`building` feature and immediately re-fails it. Pipeline snapshot is cached server-side — needs `refresh_pipeline_snapshot` RPC call or orchestrator cycle to update.
- **Critical**: Diagnosis jobs must instruct the agent to write report to `.claude/{role}-report.md` with `status: pass` prefix. Without this, executor defaults to `NO_REPORT`. The executor looks for report files at specific paths based on role name.
- **Executor result storage**: `sendJobComplete` now stores full report text (not just verdict string) in `jobs.result`. Changed in executor.ts — `report ?? result` ensures the full report is available for UI polling.

## Active Design Docs
- Model & Subscription Flexibility: `docs/plans/active/2026-03-06-model-flexibility-design.md` — decouples roles from hardcoded models, introduces `machine_backends` table, Backend interface, runtime probing, model preference chains
- Dynamic Roadmap: `docs/plans/active/2026-03-07-dynamic-roadmap-design.md` — DB-driven tech tree, Phase 1 shipped (read-only), Phases 2-4 (CPO management, automated audit, generative roadmap) captured as idea
- Tech tree visualization: `packages/webui/public/tech-tree.html` — static Civ-style tech tree showing all mega-projects, dependencies, swim lanes. Superseded by DB-driven Roadmap page.

## Capabilities Table (2026-03-08)
- 32 capabilities in `capabilities` table, all with `details` markdown populated
- All `details` fields: structured bullet points only (no redundant headings, no trailing summary paragraphs)
- `details` updated via Supabase REST API PATCH (`/rest/v1/capabilities?id=eq.{id}`)
- Roadmap detail panel renders details via custom `renderMarkdown()` function (HTML string, not React components)
- Roadmap detail panel also shows: lane, progress bar, deps summary, tooltip as description, status notes for locked/draft

## Doc Reorganization (2026-03-07)
- Shipped: idea-to-job-pipeline-design, terminal-first-cpo (design + plan + cards), dashboard-intake-pipeline-spec, detail-panels-reimplementation
- Archived: persistent-agent-bootstrap-parity-proposal
- Parked: modular-prompt-architecture-proposal

## Domain Notes
- Replaces zazig v1's VP-Eng, Supervisor, watchdog, and launch scripts
- CPO is the only persistent agent — all others are ephemeral and card-driven
- Collaborative instance: Tom Weaver + Chris Evans
- Resource pool: Tom (2 Claude Code + 1 Codex), Chris (1 Claude Code + 1 Codex)
- Design doc: docs/plans/2026-02-18-orchestration-server-design.md
- Spacebot/ZeroClaw analysis: referenced in zazig v1 repo at docs/plans/2026-02-18-zazig-evolution-spacebot-zeroclaw.md
