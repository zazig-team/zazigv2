-- Spring Clean Phase 1: Backwork 27 built systems as done ideas
-- Run in Supabase SQL Editor (bypasses RLS)
-- After running, verify with: SELECT count(*) FROM ideas WHERE 'backworked' = ANY(tags);

INSERT INTO ideas (company_id, project_id, title, raw_text, description, originator, source, status, priority, tags, created_at)
VALUES

-- ============================================================
-- CATEGORY A: Built manually by Tom, zero DB presence (13)
-- ============================================================

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Build Pipeline (core orchestrator, daemon, job dispatch)',
 'Core build pipeline: orchestrator event loop, daemon executor, job dispatch, feature lifecycle state machine. The foundational system everything else runs on.',
 'Design: docs/plans/2026-02-22-build-pipeline-design.md. Built manually by Tom pre-pipeline. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'foundation'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Persistent Agent Bootstrap (workspace creation, session management)',
 'Persistent agent system: workspace creation, CLAUDE.md assembly, session lifecycle for long-running exec agents (CPO, CTO).',
 'Design: docs/plans/2026-02-20-persistent-agent-bootstrap-design.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'foundation'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Exec Personality System (role prompts, voice, decision style)',
 'Personality injection system: prompt column on roles table, voice/communication/decision-making config, assembleContext integration.',
 'Design: docs/plans/2026-02-20-exec-personality-system-design.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'foundation'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Multi-company Support (company_id on all tables, RLS policies)',
 'Multi-tenant architecture: company_id foreign key on all tables, row-level security policies, tenant isolation for features/jobs/ideas.',
 'Design: docs/plans/2026-02-20-multi-company-pipeline-design.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'foundation'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'MCP Access Control (per-role tool filtering)',
 'MCP tool access control: mcp_tools column on roles table, tool filtering in agent-mcp-server, per-role tool allowlists.',
 'Design: docs/plans/2026-02-22-mcp-access-control-design.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'foundation'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Prompt Freshness Hook (pre-commit staleness check)',
 'Pre-commit hook checking role prompt staleness. Warns when prompts havent been updated relative to code changes.',
 'Design: docs/plans/2026-02-22-prompt-freshness-hook-design.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'low', ARRAY['backworked', 'tooling'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Contractor Dispatch (request_work edge function, standalone jobs)',
 'Standalone contractor dispatch: request_work edge function, request_standalone_work() postgres function, source column on jobs, conditional feature_id constraint, NO_CODE_CONTEXT path.',
 'Design: docs/plans/2026-02-25-contractor-dispatch-routing-plan.md. Built manually by Tom 2026-02-27. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'pipeline'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Pipeline Technician Role (execute_sql, prescribed DB operations)',
 'Pipeline technician contractor role: execute_sql MCP tool scoped to jobs/features/agent_events/machines tables. Commissioned by execs for DB-level pipeline fixes.',
 'Design: docs/plans/2026-02-25-contractor-dispatch-routing-plan.md (Deliverable 2). Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Pipeline Snapshot Cache (pre-computed pipeline state)',
 'Pipeline snapshot cache: pipeline_snapshots table, refresh_pipeline_snapshot() postgres function, orchestrator heartbeat refresh, get-pipeline-snapshot edge function. ~500 tokens vs ~30k from raw queries.',
 'Design: docs/plans/2026-02-27-pipeline-snapshot-cache-proposal.md. Built manually by Tom 2026-02-27. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'pipeline'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Skill Sync & Distribution (workspace skill delivery chain)',
 'Skills distribution system: syncWorkspaceSkills() in executor.ts, skills.ts in packages/cli, roles.skills DB array flows through to agent workspaces.',
 'Design: docs/plans/2026-02-28-skills-manifest.md. Built manually by Tom. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Daemon Slot Reconciliation (60s slot leak prevention)',
 'Daemon slot reconciliation: reconcileSlots() runs every 60s, compares DB job status against daemon tracked slots, releases leaked slots from externally-killed jobs.',
 'No design doc — commit aef4fe4. Built manually by Tom 2026-02-27 to fix zombie slot leak. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'bugfix'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Zombie Job Guards (four-layer terminal feature protection)',
 'Four-layer zombie job guard: dispatch guard, creation guard, lifecycle cleanup, constant. Timeout uses created_at not started_at. Prevents deploy_to_test jobs from consuming slots forever.',
 'No design doc — commit 7595703. Built manually by Tom 2026-02-27. Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'bugfix'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Edge Function Autodeploy (GitHub Actions CI/CD)',
 'GitHub Actions workflow for automatic edge function deployment on push to master. Partial — HEAD~1 bug means multi-file commits miss functions.',
 'Design: docs/plans/2026-02-25-edge-function-autodeploy.md. Built manually by Tom (partial). Backworked during spring clean 2026-03-01.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'tooling', 'partial'], now()),

-- ============================================================
-- CATEGORY B: Pipeline-complete features, backfill source idea (10)
-- ============================================================

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Ideas Inbox (table, edge functions, MCP tools)',
 'Ideas inbox system: ideas table, 5 edge functions (create/query/update/promote/batch-create), MCP tools for CPO triage workflow.',
 'Design: docs/plans/2026-02-25-ideas-pipeline-unified-design.md. Built through pipeline as feature ea21ee02. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Ideaify Skill (CPO triage integration)',
 'Ideaify skill: bulk processor for raw signals into structured inbox records. CPO runs Steps 1-6 inline, dispatches contractor for Step 7 DB writes.',
 'Design: docs/plans/2026-02-25-ideas-pipeline-unified-design.md. Built through pipeline as feature 38a1d16e. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Build Pipeline Execution Gates (approval checkpoints)',
 'Execution gates: verification checkpoints in the pipeline lifecycle that require explicit approval before proceeding to next stage.',
 'Design: docs/plans/2026-02-22-build-pipeline-execution-gates-design.md. Built through pipeline as feature 3443f776. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Orchestrator Lifecycle Polling Gaps Fix',
 'Fix for orchestrator polling gaps: missed Realtime broadcasts leaving jobs in executing state forever. Auto-fails zombie deploy_to_test jobs >15 min.',
 'No design doc — bug fix. Built through pipeline as feature bc9e2a0f. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'pipeline-built', 'bugfix'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Clean Slate on Re-breakdown',
 'Clean slate fix: old completed breakdown jobs now cleaned up when feature resets for re-breakdown. Prevents stale job contamination.',
 'No design doc — bug fix. Built through pipeline as feature 33e0b29e. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built', 'bugfix'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Null-context Validation Gate',
 'Null-context validation: jobs with null context now rejected at dispatch time instead of consuming slots and failing silently.',
 'No design doc — bug fix. Built through pipeline as feature 2e9a34a6. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built', 'bugfix'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Pipeline Smoke Tests',
 'Pipeline smoke tests: automated test suite for verifying pipeline health — orchestrator test suite with 25 passing tests.',
 'Design: docs/plans/2026-02-24-pipeline-smoke-test-spec.md. Built through pipeline as feature 2e9f067c. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Hello-Test Edge Function (pipeline integration test)',
 'Hello-test edge function: minimal edge function used as pipeline integration test to verify the full build-deploy-verify cycle works.',
 'No design doc — pipeline test. Built through pipeline as feature 4b9c9ef6. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'low', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Goals & Focus Areas (data model + MCP tools)',
 'Goals and focus areas system: goals table, focus_areas table, link tables, CRUD edge functions, MCP tools for CPO strategy work.',
 'Design: docs/plans/2026-02-27-goals-and-focus-areas-design.md. Built through pipeline as feature 2a4f892c. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Skills Distribution CLI (workspace skill delivery)',
 'Skills distribution CLI: command-line tool and executor integration for delivering skills from roles.skills DB array to agent workspaces.',
 'Design: docs/plans/2026-02-28-skills-manifest.md. Built through pipeline as feature 84e5c68a. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'pipeline-built'], now()),

-- ============================================================
-- CATEGORY C: Failed features that were actually built manually (4)
-- ============================================================

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Standalone Dispatch + Fast-Track Pipeline Mode',
 'Standalone dispatch system: request_work MCP tool, request-work edge function, request_standalone_work() postgres function, fast-track mode, NO_CODE_CONTEXT executor path.',
 'Design: docs/plans/2026-02-25-contractor-dispatch-routing-plan.md. Pipeline feature aacd243b failed 1x but system was built manually by Tom 2026-02-27. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'high', ARRAY['backworked', 'failed-but-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Telegram Ideas Bot (inbound idea capture via Telegram)',
 'Telegram bot for capturing ideas: webhook endpoint, message parsing, idea creation via Supabase. Allows idea capture from mobile.',
 'Design: docs/plans/2026-02-25-ideas-pipeline-unified-design.md + manual build doc. Pipeline feature 59b8d9e5 failed 73x, built manually. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'medium', ARRAY['backworked', 'failed-but-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Terminal-Mode Orchestrator Notifications',
 'Terminal notification system for orchestrator events. Already fully built on master.',
 'Manual build doc: docs/plans/active/2026-03-01-terminal-notifications-manual-build.md. Pipeline feature d78a3b06 failed 53x, already on master. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'low', ARRAY['backworked', 'failed-but-built'], now()),

('00000000-0000-0000-0000-000000000001', '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
 'Query Idea Status (edge function + MCP tool)',
 'Edge function and MCP tool for querying idea status. Allows agents to check idea state programmatically.',
 'Manual build doc: docs/plans/active/2026-03-01-query-idea-status-manual-build.md. Pipeline feature 3c6b11f8 failed 45x, built on branch. Backworked idea for source traceability.',
 'tom', 'agent', 'done', 'low', ARRAY['backworked', 'failed-but-built'], now());
