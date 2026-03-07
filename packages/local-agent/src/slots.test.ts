import { describe, expect, it } from "vitest";
import { SlotTracker } from "./slots.js";

describe("SlotTracker.tryAcquire", () => {
  it("returns true and consumes a slot when capacity is available", () => {
    const slots = new SlotTracker({ claude_code: 1, codex: 1 });

    expect(slots.tryAcquire("codex")).toBe(true);
    expect(slots.getAvailable().codex).toBe(0);
  });

  it("returns false and does not change inUse when at capacity", () => {
    const slots = new SlotTracker({ claude_code: 1, codex: 1 });

    expect(slots.tryAcquire("claude_code")).toBe(true);
    expect(slots.tryAcquire("claude_code")).toBe(false);
    expect(slots.getAvailable().claude_code).toBe(0);
  });
});
