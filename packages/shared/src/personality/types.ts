export interface BeliefStatement {
  principle: string;
  rationale: string;
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
    rate: number;
  }>;
  voice_notes: string;
  contextual_overlays: ContextualOverlay[];
  anti_patterns?: AntiPattern[];
  productive_flaw?: string;
  domain_boundaries?: string[];
}

export interface CompiledPersonality {
  role_display_name: string;
  archetype: ArchetypeDefinition;
  dimensions: Record<string, number>;
  philosophy: BeliefStatement[];
  root_constraints: string[];
  productive_flaw?: string;
  anti_patterns?: AntiPattern[];
  domain_boundaries?: string[];
  context?: string;
}

export type PersonalityMode = "full" | "sub_agent";
