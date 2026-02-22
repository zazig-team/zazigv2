STATUS: COMPLETE
CARD: 69985e48e7e24d4ec17dbabd
FILES: supabase/migrations/011_personality_archetypes_seed.sql
NOTES: 6 archetypes seeded (3 CPO: strategist, founders_instinct, operator; 3 CTO: pragmatist, architect, translator). All dimension defaults within archetype bounds, all bounds within [0,100]. voice_notes ≤500 chars, productive_flaw ≤300 chars. Philosophy rationales first-person experiential. 4 anti_patterns per archetype (specific catchable behaviours). 2-3 contextual_overlays per archetype (style-plane offsets only: verbosity/technicality/formality/proactivity/directness). Idempotent via ON CONFLICT (role_id, name) DO NOTHING. display_name and tagline columns populated per actual 010 schema. Fixed "always" policy verb in Architect voice_notes.
