# Pipeline Task 2 — Schema Migration Report

**Task:** Add pipeline columns and status values to features and jobs tables
**Branch:** zazig/pipeline-task2-schema
**Migration:** `supabase/migrations/004_pipeline_schema_v2.sql`
**Date:** 2026-02-20

## Migration Number

Used **004** (next available after 003_multi_tenant_schema.sql). Task suggested 007 but instructed to check — 004 was the first available.

## Changes

### Features table — new columns
- `spec text` — feature specification text
- `acceptance_tests text` — acceptance test descriptions
- `human_checklist text` — manual testing checklist
- `feature_branch text` — git branch for feature

### Features table — expanded status
Added: `design`, `building`, `verifying`, `testing`, `done`, `cancelled`
(Preserved existing: `proposed`, `designing`, `in_progress`, `complete`)

### Jobs table — new columns
- `acceptance_tests text` — acceptance tests for this job
- `sequence integer` — ordering of jobs within a feature
- `job_branch text` — git branch for this specific job
- `verify_context text` — context provided to verification agent
- `rejection_feedback text` — feedback when job is rejected

### Jobs table — expanded status
Added: `verifying`, `verify_failed`, `testing`, `approved`, `rejected`, `done`, `cancelled`
(Preserved existing: `queued`, `dispatched`, `executing`, `waiting_on_human`, `reviewing`, `complete`, `failed`)

### Events table — expanded event types
Added: `job_verifying`, `job_verify_failed`, `job_testing`, `job_approved`, `job_rejected`, `job_done`, `job_cancelled`, `feature_building`, `feature_verifying`, `feature_testing`, `feature_done`, `feature_cancelled`

### Stored procedures
- `release_slot(p_job_id uuid)` — atomic slot release (updates machine slots + marks job done)
- `all_feature_jobs_complete(p_feature_id uuid)` — returns true if all non-cancelled jobs are done/approved

## Pre-merge check
All checks passed (lint, tsc).

## Token Usage
- **codex-delegate implement**: 1 invocation (gpt-5.3-codex, xhigh reasoning)
- **Claude**: Discovery reads, verification, report writing
