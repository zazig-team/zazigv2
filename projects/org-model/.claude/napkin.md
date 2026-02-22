# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences
- Per-user personality = contextual modifier (small offset on one dimension), NOT a full personality fork
- Reuse existing `roles` table as Layer 1, don't create separate `exec_roles`
- No LLM in the evolution loop — all signal detection is deterministic
- Doppler project: zazig, config: prd

## Codebase Gotchas
- Migration numbering: personality system is 009 (after pipeline's 008)
- `roles` table already has 5 rows seeded — personality adds `root_constraints` column, doesn't create new roles
- `StartJob` message type needs `personalityPrompt` field added (additive, non-breaking)

## Patterns That Work
- Two-plane architecture: style plane (prompted) + policy plane (orchestrator-enforced)
- Optimistic locking via `version` column for concurrent evolution updates

## Patterns That Don't Work
- Agent self-modification of identity (OpenClaw's fatal flaw)
- NL-based signal detection for evolution (spoofable — use structured commands only)
- Full personality forks per user (expensive, identity-splitting)

## Domain Notes
- Design doc: docs/plans/2026-02-20-exec-personality-system-design.md
- OpenClaw synthesis: docs/research/2026-02-19-openclaw soul (synthesis).md
- 9 dimensions: verbosity, technicality, formality, proactivity, directness, risk_tolerance, autonomy, analysis_depth, speed_bias
- 6 archetypes shipped: CPO (Strategist, Founder's Instinct, Operator), CTO (Pragmatist, Architect, Translator)
