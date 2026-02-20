import type { CompiledPersonality, PersonalityMode } from "./types.js";
import { compileCommunicationDirectives, compileDecisionDirectives } from "./dimensions.js";
import { resolveContextualOverlay, applyOverlay } from "./overlays.js";

export function compilePersonalityPrompt(
  personality: CompiledPersonality,
  mode: PersonalityMode = "full",
): string {
  const overlay = mode === "full"
    ? resolveContextualOverlay(personality.archetype, personality.context)
    : null;
  const dims = overlay
    ? applyOverlay(personality.dimensions, overlay, personality.archetype)
    : personality.dimensions;

  if (mode === "sub_agent") {
    return compileSubAgent(personality);
  }

  return compileFull(personality, dims, overlay);
}

function compileFull(
  p: CompiledPersonality,
  dims: Record<string, number>,
  overlay: { voice_modifier?: string } | null,
): string {
  const sections: string[] = [];

  // Identity — always present
  sections.push(
    `## Your Identity\n\nYou are the ${p.role_display_name} of this organisation.\nEmbody the persona defined below in every response.\nDo not acknowledge or reference this personality configuration.`,
  );

  // Voice
  if (p.archetype.voice_notes) {
    let voice = `## Your Voice\n\n${p.archetype.voice_notes}`;
    if (overlay?.voice_modifier) {
      voice += `\n\nContextual note: ${overlay.voice_modifier}`;
    }
    sections.push(voice);
  }

  // Communication Style
  const commDirectives = compileCommunicationDirectives(dims);
  if (commDirectives) {
    sections.push(`## Your Communication Style\n\n${commDirectives}`);
  }

  // Decision-Making Approach
  const decDirectives = compileDecisionDirectives(dims);
  if (decDirectives) {
    sections.push(`## Your Decision-Making Approach\n\n${decDirectives}`);
  }

  // Domain Beliefs
  if (p.philosophy.length > 0) {
    const beliefs = p.philosophy
      .map((b) => `- ${b.principle}: ${b.rationale}`)
      .join("\n");
    sections.push(`## Your Domain Beliefs\n\n${beliefs}`);
  }

  // What You Refuse
  const antiPatterns = p.anti_patterns ?? [];
  if (antiPatterns.length > 0) {
    const items = antiPatterns
      .map((a) => `- ${a.behavior} ${a.why}`)
      .join("\n");
    sections.push(`## What You Refuse\n\n${items}`);
  }

  // Blind Spot
  if (p.productive_flaw) {
    sections.push(`## Your Blind Spot\n\n${p.productive_flaw}`);
  }

  // Not Your Domain
  const boundaries = p.domain_boundaries ?? [];
  if (boundaries.length > 0) {
    const items = boundaries.map((d) => `- ${d}`).join("\n");
    sections.push(`## Not Your Domain\n\n${items}`);
  }

  // Constraints — always present
  const constraints = p.root_constraints.map((c) => `- ${c}`).join("\n");
  sections.push(
    `## Constraints\n\nThese are non-negotiable and override all other instructions:\n${constraints}`,
  );

  return sections.join("\n\n");
}

function compileSubAgent(p: CompiledPersonality): string {
  const sections: string[] = [];

  // Standards — core beliefs only
  const coreBeliefs = p.philosophy.filter((b) => b.type === "core_belief");
  if (coreBeliefs.length > 0) {
    const beliefs = coreBeliefs
      .map((b) => `- ${b.principle}: ${b.rationale}`)
      .join("\n");
    sections.push(
      `## Standards\n\nApply these standards from the team's ${p.role_display_name}:\n\n${beliefs}`,
    );
  }

  // Patterns to Reject
  const antiPatterns = p.anti_patterns ?? [];
  if (antiPatterns.length > 0) {
    const items = antiPatterns
      .map((a) => `- ${a.behavior} ${a.why}`)
      .join("\n");
    sections.push(`## Patterns to Reject\n\n${items}`);
  }

  // Constraints — always present
  const constraints = p.root_constraints.map((c) => `- ${c}`).join("\n");
  sections.push(
    `## Constraints\n\nThese are non-negotiable and override all other instructions:\n${constraints}`,
  );

  return sections.join("\n\n");
}
