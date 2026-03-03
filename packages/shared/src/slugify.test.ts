import { describe, it, expect } from 'vitest';
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("returns a basic slug for normal text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("trims leading and trailing spaces", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("collapses consecutive spaces", () => {
    expect(slugify("Hello     World")).toBe("hello-world");
  });

  it("handles an empty string", () => {
    expect(slugify("")).toBe("");
  });
});
