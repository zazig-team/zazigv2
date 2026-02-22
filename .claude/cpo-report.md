STATUS: COMPLETE
CARD: 69985e8900c3defd30abdc14
FILES: packages/cli/src/commands/personality.ts, packages/cli/src/index.ts
NOTES: company_id resolved from ~/.zazigv2/machine.yaml (written by `zazig join`). Supabase joins use PostgREST embedded resource syntax (archetype:exec_archetypes(...)). Upsert uses POST with on_conflict=company_id,role_id and Prefer: resolution=merge-duplicates. Archetype lookup matches on display_name. Dimension "current" value priority: user_overrides > evolved_state > archetype default.
