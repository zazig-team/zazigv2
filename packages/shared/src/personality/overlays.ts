import type { ArchetypeDefinition, ContextualOverlay } from "./types.js";

const POLICY_PLANE_DIMENSIONS = new Set([
  "risk_tolerance",
  "autonomy",
  "analysis_depth",
  "speed_bias",
]);

export function resolveContextualOverlay(
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

export function applyOverlay(
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
