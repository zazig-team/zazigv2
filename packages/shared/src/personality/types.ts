export interface BeliefStatement {
  principle: string;
  rationale: string;
  /** Phase 2: conditional rendering based on situation. Not consumed in Phase 1. */
  applies_when?: string;
  type: "core_belief" | "operating_hypothesis";
}

export interface AntiPattern {
  behavior: string;
  why: string;
}

export interface ContextualOverlay {
  trigger: string;
  dimension_offsets: Record<string, number>;
  voice_modifier?: string;
}

export interface ArchetypeDefinition {
  dimensions: Record<string, {
    default: number;
    bounds: [number, number];
    /** Phase 3: max change per auto-evolution cycle. Not consumed in Phase 1. */
    rate: number;
  }>;
  voice_notes: string;
  contextual_overlays: ContextualOverlay[];
}

export interface CompiledPersonality {
  role_display_name: string;
  archetype: ArchetypeDefinition;
  /** Effective dimensions post-merge: archetype defaults ← evolved_state ← user_overrides, all clamped. */
  dimensions: Record<string, number>;
  philosophy: BeliefStatement[];
  root_constraints: string[];
  productive_flaw?: string;
  anti_patterns?: AntiPattern[];
  domain_boundaries?: string[];
}

export type PersonalityMode = "full" | "sub_agent";
