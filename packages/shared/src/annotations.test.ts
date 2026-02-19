/**
 * Unit tests for parseAnnotation.
 *
 * These are plain TypeScript assertions — no test runner required.
 * Run via: npx tsx packages/shared/src/annotations.test.ts
 *
 * Exit code 0 = all passed, non-zero = at least one failure.
 */

import { parseAnnotation } from "./annotations.js";
import type { CardAnnotation } from "./annotations.js";

// ---------------------------------------------------------------------------
// Minimal assertion helper
// ---------------------------------------------------------------------------

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  pass: ${message}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

console.log("\nparseAnnotation — unit tests\n");

// --- Happy path ---

console.log("Happy path:");

assert(
  deepEqual(
    parseAnnotation(
      "Some description\n<!-- orchestrator -->\ncomplexity: simple\ncard-type: code\n<!-- /orchestrator -->",
    ),
    { complexity: "simple", cardType: "code" } satisfies CardAnnotation,
  ),
  "parses simple + code",
);

assert(
  deepEqual(
    parseAnnotation(
      "<!-- orchestrator -->\ncomplexity: complex\ncard-type: research\n<!-- /orchestrator -->",
    ),
    { complexity: "complex", cardType: "research" } satisfies CardAnnotation,
  ),
  "parses complex + research",
);

assert(
  deepEqual(
    parseAnnotation(
      "<!-- orchestrator -->\ncomplexity: medium\ncard-type: infra\n<!-- /orchestrator -->",
    ),
    { complexity: "medium", cardType: "infra" } satisfies CardAnnotation,
  ),
  "parses medium + infra",
);

assert(
  deepEqual(
    parseAnnotation(
      "<!-- orchestrator -->\ncomplexity: simple\ncard-type: design\n<!-- /orchestrator -->",
    ),
    { complexity: "simple", cardType: "design" } satisfies CardAnnotation,
  ),
  "parses simple + design",
);

assert(
  deepEqual(
    parseAnnotation(
      "<!-- orchestrator -->\ncomplexity: complex\ncard-type: docs\n<!-- /orchestrator -->",
    ),
    { complexity: "complex", cardType: "docs" } satisfies CardAnnotation,
  ),
  "parses complex + docs",
);

// --- Whitespace tolerance ---

console.log("\nWhitespace tolerance:");

assert(
  deepEqual(
    parseAnnotation(
      "<!--orchestrator-->\n  complexity :   SIMPLE  \n  card-type :   CODE  \n<!--/orchestrator-->",
    ),
    { complexity: "simple", cardType: "code" } satisfies CardAnnotation,
  ),
  "trims and lowercases keys/values",
);

assert(
  deepEqual(
    parseAnnotation(
      "<!-- ORCHESTRATOR -->\ncomplexity: medium\ncard-type: infra\n<!-- /ORCHESTRATOR -->",
    ),
    { complexity: "medium", cardType: "infra" } satisfies CardAnnotation,
  ),
  "delimiter tags are case-insensitive",
);

// --- Extra keys are ignored ---

console.log("\nExtra keys:");

assert(
  deepEqual(
    parseAnnotation(
      "<!-- orchestrator -->\ncomplexity: simple\ncard-type: code\nunknown-key: whatever\n<!-- /orchestrator -->",
    ),
    { complexity: "simple", cardType: "code" } satisfies CardAnnotation,
  ),
  "ignores extra keys",
);

// --- Block appears mid-description ---

console.log("\nBlock placement:");

assert(
  deepEqual(
    parseAnnotation(
      "Implement the feature as described.\n\n<!-- orchestrator -->\ncomplexity: medium\ncard-type: code\n<!-- /orchestrator -->\n\nAdditional notes here.",
    ),
    { complexity: "medium", cardType: "code" } satisfies CardAnnotation,
  ),
  "parses block in middle of description",
);

// --- Null cases ---

console.log("\nNull cases (missing / invalid):");

assert(parseAnnotation("") === null, "empty string → null");
assert(parseAnnotation("No annotation block here") === null, "no block → null");

assert(
  parseAnnotation(
    "<!-- orchestrator -->\ncomplexity: extreme\ncard-type: code\n<!-- /orchestrator -->",
  ) === null,
  "invalid complexity → null",
);

assert(
  parseAnnotation(
    "<!-- orchestrator -->\ncomplexity: simple\ncard-type: video\n<!-- /orchestrator -->",
  ) === null,
  "invalid card-type → null",
);

assert(
  parseAnnotation(
    "<!-- orchestrator -->\ncomplexity: simple\n<!-- /orchestrator -->",
  ) === null,
  "missing card-type → null",
);

assert(
  parseAnnotation(
    "<!-- orchestrator -->\ncard-type: code\n<!-- /orchestrator -->",
  ) === null,
  "missing complexity → null",
);

assert(
  parseAnnotation(
    "<!-- orchestrator -->\n<!-- /orchestrator -->",
  ) === null,
  "empty block → null",
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? "All tests passed." : `${failures} test(s) failed.`}\n`);

if (failures > 0) {
  throw new Error(`${failures} test(s) failed.`);
}
