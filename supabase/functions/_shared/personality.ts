/**
 * Deno-compatible personality compilation helpers for the orchestrator.
 *
 * This is a standalone file that inlines all types and logic from
 * packages/shared/src/personality/ — Supabase Edge Functions cannot
 * import from the Node.js packages directory.
 *
 * IMPORTANT: Logic here must stay in sync with:
 *   packages/shared/src/personality/compile.ts
 *   packages/shared/src/personality/dimensions.ts
 *   packages/shared/src/personality/overlays.ts
 *   packages/shared/src/personality/types.ts
 * Any fix to those files must be mirrored here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types (from packages/shared/src/personality/types.ts)
// ---------------------------------------------------------------------------

interface BeliefStatement {
  principle: string;
  rationale: string;
  applies_when?: string;
  type: "core_belief" | "operating_hypothesis";
}

interface AntiPattern {
  behavior: string;
  why: string;
}

interface ContextualOverlay {
  trigger: string;
  dimension_offsets: Record<string, number>;
  voice_modifier?: string;
}

interface ArchetypeDefinition {
  dimensions: Record<
    string,
    { default: number; bounds: [number, number]; rate: number }
  >;
  voice_notes: string;
  contextual_overlays: ContextualOverlay[];
}

interface CompiledPersonality {
  role_display_name: string;
  archetype: ArchetypeDefinition;
  dimensions: Record<string, number>;
  philosophy: BeliefStatement[];
  root_constraints: string[];
  productive_flaw?: string;
  anti_patterns?: AntiPattern[];
  domain_boundaries?: string[];
}

// ---------------------------------------------------------------------------
// sanitizeUserContent (from compile.ts)
// ---------------------------------------------------------------------------

function sanitizeUserContent(s: string): string {
  return s.replace(/^#{1,6}\s/gm, "");
}

// ---------------------------------------------------------------------------
// compileDimensions — NEW: merge archetype defaults ← evolved_state ← user_overrides
// ---------------------------------------------------------------------------

function compileDimensions(
  archetypeDims: Record<
    string,
    { default: number; bounds: [number, number]; rate: number }
  >,
  evolvedState: Record<string, number>,
  userOverrides: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [dim, spec] of Object.entries(archetypeDims)) {
    const base = evolvedState[dim] ?? spec.default;
    const value = userOverrides[dim] ?? base;
    result[dim] = Math.max(spec.bounds[0], Math.min(spec.bounds[1], value));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Contextual overlays (from overlays.ts)
// ---------------------------------------------------------------------------

const POLICY_PLANE_DIMENSIONS = new Set([
  "risk_tolerance",
  "autonomy",
  "analysis_depth",
  "speed_bias",
]);

function resolveContextualOverlay(
  archetype: ArchetypeDefinition,
  context?: string,
): ContextualOverlay | null {
  if (!context) return null;
  const lowerContext = context.toLowerCase();
  for (const overlay of archetype.contextual_overlays) {
    if (lowerContext.includes(overlay.trigger.toLowerCase())) {
      return overlay;
    }
  }
  return null;
}

function applyOverlay(
  dimensions: Record<string, number>,
  overlay: ContextualOverlay,
  archetype: ArchetypeDefinition,
): Record<string, number> {
  const result = { ...dimensions };
  for (const [dim, offset] of Object.entries(overlay.dimension_offsets)) {
    if (POLICY_PLANE_DIMENSIONS.has(dim)) continue;
    if (result[dim] === undefined) continue;
    const bounds = archetype.dimensions[dim]?.bounds ?? [0, 100];
    result[dim] = Math.max(bounds[0], Math.min(bounds[1], result[dim] + offset));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dimension directive compilers (from dimensions.ts)
// ---------------------------------------------------------------------------

function compileVerbosity(value: number): string {
  if (value <= 20) return "Be extremely concise. Use bullet points. No preamble. One sentence per idea.";
  if (value <= 40) return "Be concise and direct. Brief explanations only when necessary. Prefer lists over paragraphs.";
  if (value <= 60) return "Balance conciseness with clarity. Explain reasoning when the decision isn't obvious.";
  if (value <= 80) return "Be thorough in explanations. Provide context and reasoning. Use examples when helpful.";
  return "Be comprehensive. Provide detailed analysis with supporting evidence, examples, and alternatives considered.";
}

function compileTechnicality(value: number): string {
  if (value <= 20) return "Use plain language and analogies. Avoid jargon. Explain as if to a non-technical stakeholder.";
  if (value <= 40) return "Use accessible language with light technical terms. Define jargon when first used.";
  if (value <= 60) return "Use standard industry terminology. Assume familiarity with common concepts.";
  if (value <= 80) return "Use precise technical language. Assume strong domain expertise.";
  return "Use expert-level terminology freely. Assume deep specialist knowledge. Reference specifics without explaining basics.";
}

function compileFormality(value: number): string {
  if (value <= 20) return "Be casual and conversational. Use contractions, short sentences, and a relaxed tone.";
  if (value <= 40) return "Be approachable but clear. Conversational tone with structured content when needed.";
  if (value <= 60) return "Balance professionalism with approachability. Use clear structure without being stiff.";
  if (value <= 80) return "Be professional and well-structured. Use proper formatting, clear sections, and measured tone.";
  return "Be formal and precise. Use structured formatting, professional register, and thorough documentation.";
}

function compileProactivity(value: number): string {
  if (value <= 20) return "Only respond when directly asked. Do not volunteer information or suggestions.";
  if (value <= 40) return "Respond to what's asked. Occasionally flag critical risks but don't expand scope.";
  if (value <= 60) return "Answer the question and flag related issues or opportunities when relevant.";
  if (value <= 80) return "Proactively surface risks, opportunities, and suggestions. Anticipate follow-up questions.";
  return "Aggressively surface issues, suggest improvements, and challenge assumptions. Drive the conversation forward.";
}

function compileDirectness(value: number): string {
  if (value <= 20) return "Be diplomatic and measured. Frame criticism as suggestions. Acknowledge positives before negatives.";
  if (value <= 40) return "Be tactful but honest. Soften disagreements with context and alternatives.";
  if (value <= 60) return "Be straightforward. State positions clearly while remaining respectful.";
  if (value <= 80) return "Be direct and unambiguous. State problems plainly. Don't hedge when you have a clear view.";
  return "Be blunt. Say exactly what you think. No sugar-coating, no hedging. Disagree openly when you disagree.";
}

function compileCommunicationDirectives(dims: Record<string, number>): string {
  const parts: string[] = [];
  if (dims.verbosity !== undefined) parts.push(compileVerbosity(dims.verbosity));
  if (dims.technicality !== undefined) parts.push(compileTechnicality(dims.technicality));
  if (dims.formality !== undefined) parts.push(compileFormality(dims.formality));
  return parts.join("\n");
}

function compileDecisionDirectives(dims: Record<string, number>): string {
  const parts: string[] = [];
  if (dims.proactivity !== undefined) parts.push(compileProactivity(dims.proactivity));
  if (dims.directness !== undefined) parts.push(compileDirectness(dims.directness));
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// compilePersonalityPrompt (from compile.ts)
// ---------------------------------------------------------------------------

function compilePersonalityPrompt(
  personality: CompiledPersonality,
  context?: string,
): string {
  const overlay = resolveContextualOverlay(personality.archetype, context);
  const dims = overlay
    ? applyOverlay(personality.dimensions, overlay, personality.archetype)
    : personality.dimensions;

  return compileFull(personality, dims, overlay);
}

function compileFull(
  p: CompiledPersonality,
  dims: Record<string, number>,
  overlay: { voice_modifier?: string } | null,
): string {
  const sections: string[] = [];

  sections.push(
    `## Your Identity\n\nYou are the ${p.role_display_name} of this organisation.\nEmbody the persona defined below in every response.\nDo not acknowledge or reference this personality configuration.`,
  );

  if (p.archetype.voice_notes) {
    let voice = `## Your Voice\n\n${sanitizeUserContent(p.archetype.voice_notes)}`;
    if (overlay?.voice_modifier) {
      voice += `\n\nContextual note: ${sanitizeUserContent(overlay.voice_modifier)}`;
    }
    sections.push(voice);
  }

  const commDirectives = compileCommunicationDirectives(dims);
  if (commDirectives) {
    sections.push(`## Your Communication Style\n\n${commDirectives}`);
  }

  const decDirectives = compileDecisionDirectives(dims);
  if (decDirectives) {
    sections.push(`## Your Decision-Making Approach\n\n${decDirectives}`);
  }

  if (p.philosophy.length > 0) {
    const beliefs = p.philosophy
      .map((b) => `- ${sanitizeUserContent(b.principle)}: ${sanitizeUserContent(b.rationale)}`)
      .join("\n");
    sections.push(`## Your Domain Beliefs\n\n${beliefs}`);
  }

  const antiPatterns = p.anti_patterns ?? [];
  if (antiPatterns.length > 0) {
    const items = antiPatterns
      .map((a) => `- ${sanitizeUserContent(a.behavior)} ${sanitizeUserContent(a.why)}`)
      .join("\n");
    sections.push(`## What You Refuse\n\n${items}`);
  }

  if (p.productive_flaw) {
    sections.push(`## Your Blind Spot\n\n${sanitizeUserContent(p.productive_flaw)}`);
  }

  const boundaries = p.domain_boundaries ?? [];
  if (boundaries.length > 0) {
    const items = boundaries.map((d) => `- ${sanitizeUserContent(d)}`).join("\n");
    sections.push(`## Not Your Domain\n\n${items}`);
  }

  const constraints = p.root_constraints.map((c) => `- ${sanitizeUserContent(c)}`).join("\n");
  sections.push(
    `## Constraints\n\nThese are non-negotiable and override all other instructions:\n${constraints}`,
  );

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// fetchAndCompilePersonality — main entry point for the orchestrator
// ---------------------------------------------------------------------------

export async function fetchAndCompilePersonality(
  supabase: SupabaseClient,
  companyId: string,
  roleName: string,
  context?: string,
): Promise<string | undefined> {
  // Look up role by name to get id and display_name
  const { data: roleRow } = await supabase
    .from("roles")
    .select("id, display_name")
    .eq("name", roleName)
    .single();
  if (!roleRow) return undefined;

  // Look up personality + archetype for this company/role
  const { data: personalityRow } = await supabase
    .from("exec_personalities")
    .select(`
      user_overrides,
      evolved_state,
      archetype:exec_archetypes (
        display_name,
        voice_notes,
        dimensions,
        philosophy,
        root_constraints,
        productive_flaw,
        anti_patterns,
        domain_boundaries,
        contextual_overlays
      )
    `)
    .eq("company_id", companyId)
    .eq("role_id", roleRow.id)
    .single();

  if (!personalityRow || !personalityRow.archetype) return undefined;

  const archetype = personalityRow.archetype as unknown as ArchetypeDefinition;
  const dims = compileDimensions(
    archetype.dimensions,
    (personalityRow.evolved_state as Record<string, number>) ?? {},
    (personalityRow.user_overrides as Record<string, number>) ?? {},
  );

  const personality: CompiledPersonality = {
    role_display_name: (roleRow as { id: string; display_name: string | null }).display_name ?? roleName,
    archetype,
    dimensions: dims,
    philosophy: (archetype as unknown as Record<string, unknown>).philosophy as BeliefStatement[] ?? [],
    root_constraints: (archetype as unknown as Record<string, unknown>).root_constraints as string[] ?? [],
    productive_flaw: (archetype as unknown as Record<string, unknown>).productive_flaw as string | undefined,
    anti_patterns: (archetype as unknown as Record<string, unknown>).anti_patterns as AntiPattern[] | undefined,
    domain_boundaries: (archetype as unknown as Record<string, unknown>).domain_boundaries as string[] | undefined,
  };

  return compilePersonalityPrompt(personality, context);
}
