import { describe, it, expect } from 'vitest';
import { parseAnnotation } from "./annotations.js";
import type { CardAnnotation } from "./annotations.js";

describe("Happy path", () => {
  it("parses simple + code", () => {
    expect(
      parseAnnotation(
        "Some description\n<!-- orchestrator -->\ncomplexity: simple\ncard-type: code\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "simple", cardType: "code" } satisfies CardAnnotation);
  });

  it("parses complex + research", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: complex\ncard-type: research\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "complex", cardType: "research" } satisfies CardAnnotation);
  });

  it("parses medium + infra", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: medium\ncard-type: infra\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "medium", cardType: "infra" } satisfies CardAnnotation);
  });

  it("parses simple + design", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: simple\ncard-type: design\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "simple", cardType: "design" } satisfies CardAnnotation);
  });

  it("parses complex + docs", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: complex\ncard-type: docs\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "complex", cardType: "docs" } satisfies CardAnnotation);
  });
});

describe("Whitespace tolerance", () => {
  it("trims and lowercases keys/values", () => {
    expect(
      parseAnnotation(
        "<!--orchestrator-->\n  complexity :   SIMPLE  \n  card-type :   CODE  \n<!--/orchestrator-->",
      ),
    ).toEqual({ complexity: "simple", cardType: "code" } satisfies CardAnnotation);
  });

  it("delimiter tags are case-insensitive", () => {
    expect(
      parseAnnotation(
        "<!-- ORCHESTRATOR -->\ncomplexity: medium\ncard-type: infra\n<!-- /ORCHESTRATOR -->",
      ),
    ).toEqual({ complexity: "medium", cardType: "infra" } satisfies CardAnnotation);
  });
});

describe("Extra keys", () => {
  it("ignores extra keys", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: simple\ncard-type: code\nunknown-key: whatever\n<!-- /orchestrator -->",
      ),
    ).toEqual({ complexity: "simple", cardType: "code" } satisfies CardAnnotation);
  });
});

describe("Block placement", () => {
  it("parses block in middle of description", () => {
    expect(
      parseAnnotation(
        "Implement the feature as described.\n\n<!-- orchestrator -->\ncomplexity: medium\ncard-type: code\n<!-- /orchestrator -->\n\nAdditional notes here.",
      ),
    ).toEqual({ complexity: "medium", cardType: "code" } satisfies CardAnnotation);
  });
});

describe("Null cases", () => {
  it("empty string → null", () => {
    expect(parseAnnotation("")).toBeNull();
  });

  it("no block → null", () => {
    expect(parseAnnotation("No annotation block here")).toBeNull();
  });

  it("invalid complexity → null", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: extreme\ncard-type: code\n<!-- /orchestrator -->",
      ),
    ).toBeNull();
  });

  it("invalid card-type → null", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: simple\ncard-type: video\n<!-- /orchestrator -->",
      ),
    ).toBeNull();
  });

  it("missing card-type → null", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncomplexity: simple\n<!-- /orchestrator -->",
      ),
    ).toBeNull();
  });

  it("missing complexity → null", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\ncard-type: code\n<!-- /orchestrator -->",
      ),
    ).toBeNull();
  });

  it("empty block → null", () => {
    expect(
      parseAnnotation(
        "<!-- orchestrator -->\n<!-- /orchestrator -->",
      ),
    ).toBeNull();
  });
});
