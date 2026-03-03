import { describe, it, expect } from "vitest";
import { formatDuration, formatRelativeTime } from "./smoke-test-6.js";

describe("formatRelativeTime", () => {
  it("returns just now for times under 60 seconds", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(date, now)).toBe("just now");
  });

  it("returns singular minute for one minute ago", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("1 minute ago");
  });

  it("returns pluralized minutes for multiple minutes", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("5 minutes ago");
  });

  it("returns singular hour for one hour ago", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 60 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("1 hour ago");
  });

  it("returns pluralized hours for multiple hours", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("3 hours ago");
  });

  it("returns singular day for one day ago", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("1 day ago");
  });

  it("returns pluralized days for multiple days", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("7 days ago");
  });

  it("returns singular month for 30 days ago", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const date = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date, now)).toBe("1 month ago");
  });
});

describe("formatDuration", () => {
  it("returns 0ms for zero", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("returns milliseconds when under 1 second", () => {
    expect(formatDuration(999)).toBe("999ms");
  });

  it("returns seconds when under 1 minute", () => {
    expect(formatDuration(1500)).toBe("1s");
  });

  it("returns minutes and seconds when under 1 hour", () => {
    expect(formatDuration(61000)).toBe("1m 1s");
  });

  it("returns hours and minutes when 1 hour or more", () => {
    expect(formatDuration(3600000 + 120000)).toBe("1h 2m");
  });
});
