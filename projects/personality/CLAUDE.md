# Personality

## What This Is
Exec personality system for zazig v2 — bounded, evolvable agent identities compiled into deterministic prompts. Replaces OpenClaw's vulnerable SOUL.md pattern with structured numeric coordinates in bounded space.

## Location
This is a project inside the `zazigv2` repository at `projects/personality/`.

## Key Design Doc
`docs/plans/2026-02-20-exec-personality-system-design.md` (in parent repo root)

## Architecture
- **Three-layer stack:** Root Identity (immutable, in `roles` table) -> Archetype (read-only per org) -> Evolved State (mutable within bounds)
- **Two-plane architecture:** Style plane (5 dims, prompt-compiled) + Policy plane (4 dims, orchestrator-enforced)
- **9 personality dimensions:** verbosity, technicality, formality, proactivity, directness, risk_tolerance, autonomy, analysis_depth, speed_bias
- **Bounded auto-evolution:** deterministic signal detection, no LLM in the evolution loop
- **Behavioral watchdog:** velocity, oscillation, boundary-sticking, source anomaly, reward degradation detection

## Development
Migration: `supabase/migrations/009_personality_system.sql` (in parent repo)
Prompt compilation: `packages/shared/src/personality/` (TBD)
Orchestrator integration: dispatch-time injection via `personalityPrompt` field on `StartJob`

## Supabase Tables (Migration 009)
- `exec_archetypes` — pre-defined personality bundles per role
- `exec_personalities` — active personality state per company per role
- `personality_watchdog` — behavioral anomaly detector state
- `personality_evolution_log` — immutable append-only audit trail
- `roles.root_constraints` — new JSONB column on existing table

## Trello Board
Board ID: 69983c1bfc662b3b1cfd2441
URL: https://trello.com/b/uyClelbo/personality
