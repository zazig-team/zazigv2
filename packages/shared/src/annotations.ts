/**
 * zazigv2 — Card Annotation Parser
 *
 * Parses structured annotation blocks from Trello card descriptions.
 *
 * Expected block format (HTML comment delimiters):
 *
 *   <!-- orchestrator -->
 *   complexity: simple
 *   card-type: code
 *   <!-- /orchestrator -->
 *
 * Rules:
 *   - Returns null (never throws) if the block is missing or values are invalid.
 *   - Whitespace around keys and values is trimmed.
 *   - Keys are case-insensitive.
 *   - Only `complexity` and `card-type` are recognised; extra keys are ignored.
 */

import type { Complexity, CardType } from "./messages.js";

export interface CardAnnotation {
  complexity: Complexity;
  cardType: CardType;
}

// ---------------------------------------------------------------------------
// Valid value sets
// ---------------------------------------------------------------------------

const VALID_COMPLEXITY = new Set<string>(["simple", "medium", "complex"]);
const VALID_CARD_TYPE = new Set<string>(["code", "infra", "design", "research", "docs"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the `<!-- orchestrator -->...<!-- /orchestrator -->` annotation block
 * from a Trello card description.
 *
 * @param description - Raw card description string (may be empty or null-ish).
 * @returns A `CardAnnotation` object, or `null` if the block is absent or invalid.
 */
export function parseAnnotation(description: string): CardAnnotation | null {
  if (!description) return null;

  // Extract the orchestrator block (non-greedy, DOTALL via [\s\S])
  const blockMatch = description.match(
    /<!--\s*orchestrator\s*-->([\s\S]*?)<!--\s*\/orchestrator\s*-->/i,
  );
  if (!blockMatch) return null;

  const block = blockMatch[1];

  // Parse key: value lines
  const pairs = parseKeyValuePairs(block);

  // Extract and validate complexity
  const rawComplexity = pairs.get("complexity");
  if (!rawComplexity || !VALID_COMPLEXITY.has(rawComplexity)) return null;

  // Extract and validate card-type
  const rawCardType = pairs.get("card-type");
  if (!rawCardType || !VALID_CARD_TYPE.has(rawCardType)) return null;

  return {
    complexity: rawComplexity as Complexity,
    cardType: rawCardType as CardType,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse `key: value` lines from a block of text.
 * Keys are lowercased and trimmed; values are trimmed.
 * Lines that don't match the `key: value` pattern are silently skipped.
 */
function parseKeyValuePairs(block: string): Map<string, string> {
  const result = new Map<string, string>();

  for (const line of block.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim().toLowerCase();

    if (key && value) {
      result.set(key, value);
    }
  }

  return result;
}
