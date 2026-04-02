import { describe, expect, it } from "vitest";
import { extractFailureSummary } from "./ci-log-extractor.js";

describe("extractFailureSummary", () => {
  it("extracts a vitest FAIL block with test name and assertion diff while excluding passing preamble", () => {
    const passingPreamble = Array.from({ length: 20 }, (_, i) => `PASS passing test ${i}`).join("\n");

    const rawLog = [
      passingPreamble,
      "",
      "FAIL packages/local-agent/src/ci-log-extractor.test.ts",
      "",
      "extractFailureSummary > extracts vitest failures",
      "",
      "  AssertionError: expected 1 to equal 2",
      "  Expected: 2",
      "  Received: 1",
      "",
      " Test Files  1 failed (1)",
      " Tests  1 failed | 20 passed (21)",
      " Start at  10:00:00",
      " Duration  100ms",
    ].join("\n");

    const result = extractFailureSummary(rawLog);

    expect(result).toContain("extractFailureSummary > extracts vitest failures");
    expect(result).toContain("Expected: 2");
    expect(result).toContain("Received: 1");
    expect(result).not.toContain("PASS passing test 0");
  });

  it("extracts a jest-style FAIL block with assertion details", () => {
    const rawLog = [
      "PASS src/passing.test.ts",
      "",
      "FAIL src/failing.test.ts",
      "  failing suite > returns a 500",
      "",
      "    expect(received).toBe(expected)",
      "    Expected: 500",
      "    Received: 200",
      "",
      "    at Object.<anonymous> (src/failing.test.ts:10:5)",
      "",
      "Test Suites: 1 failed, 1 passed, 2 total",
      "Tests:       1 failed, 1 passed, 2 total",
    ].join("\n");

    const result = extractFailureSummary(rawLog);

    expect(result).toContain("failing suite > returns a 500");
    expect(result).toContain("Expected: 500");
    expect(result).toContain("Received: 200");
  });

  it("falls back to the last 200 lines when no FAIL marker exists and preserves compiler errors", () => {
    const lines = Array.from({ length: 260 }, (_, i) => `build output line ${i}`);
    lines[258] = "src/index.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.";
    lines[259] = "src/main.ts(21,5): error TS2554: Expected 2 arguments, but got 1.";

    const rawLog = lines.join("\n");
    const result = extractFailureSummary(rawLog);

    expect(result).toContain("error TS2322");
    expect(result).toContain("error TS2554");
    expect(result).not.toContain("build output line 0");
    expect(result).not.toMatch(/^build output line 59$/m);
  });

  it("returns a non-empty string for an empty log", () => {
    const result = extractFailureSummary("");

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("truncates oversized extracted output to 8192 bytes and appends a gh run view marker", () => {
    const giantFailureLines = Array.from(
      { length: 600 },
      (_, i) => `  Error line ${i}: ${"x".repeat(80)} Expected: value-${i} Received: other-${i}`,
    );

    const rawLog = [
      "FAIL packages/shared/src/very-large-failure.test.ts",
      ...giantFailureLines,
      " Test Files  1 failed (1)",
      " Tests  1 failed (1)",
    ].join("\n");

    const result = extractFailureSummary(rawLog, 123456);

    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(8192);
    expect(result).toMatch(/\[truncated.*gh run view.*\]$/s);
  });

  it("strips ANSI escape sequences from the extracted result", () => {
    const rawLog = [
      "\x1b[32mPASS passing output that should not matter\x1b[0m",
      "\x1b[31mFAIL\x1b[0m packages/local-agent/src/sample.test.ts",
      "\x1b[31m* failing test\x1b[0m",
      "  \x1b[31mExpected:\x1b[0m true",
      "  \x1b[31mReceived:\x1b[0m false",
      " Test Files  1 failed (1)",
      " Tests  1 failed (1)",
    ].join("\n");

    const result = extractFailureSummary(rawLog);

    expect(result).not.toContain("\x1b");
  });
});
