import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";

import { delay, retryWithBackoff, type RetryOptions } from "./retry-with-backoff.js";

describe("retry-with-backoff", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports the required symbols", () => {
    expect(typeof delay).toBe("function");
    expect(typeof retryWithBackoff).toBe("function");

    const retryOptions: RetryOptions = {
      maxAttempts: 1,
      initialDelayMs: 1,
      maxDelayMs: 2,
      backoffFactor: 3,
    };
    expect(retryOptions.maxAttempts).toBe(1);
  });

  it("returns result immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(retryWithBackoff(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxAttempts on repeated failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const promise = retryWithBackoff(fn, { maxAttempts: 3 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws last error when all attempts are exhausted", async () => {
    const finalError = new Error("last-error");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValue(finalError);

    const promise = retryWithBackoff(fn, { maxAttempts: 2 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBe(finalError);
  });

  it("increases delay between retries exponentially", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = retryWithBackoff(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      backoffFactor: 2,
      maxDelayMs: 10000,
    });

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
    expect(await promise).toBe("ok");
  });

  it("caps exponential delay at maxDelayMs", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = retryWithBackoff(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      backoffFactor: 10,
      maxDelayMs: 500,
    });

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 500);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 500);
    expect(await promise).toBe("ok");
  });

  it("applies default options when none are specified", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = retryWithBackoff(fn);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);

    await vi.advanceTimersToNextTimerAsync();
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);

    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("treats maxAttempts of 1 as no retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("no-retry"));

    const promise = retryWithBackoff(fn, { maxAttempts: 1 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("no-retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("contains no imports, require calls, or any types in the implementation", async () => {
    const source = await fs.readFile(new URL("./retry-with-backoff.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/\bimport\s+/);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/:\s*any\b/);
    expect(source).not.toMatch(/\bas\s+any\b/);
    expect(source).toContain("export interface RetryOptions");
  });
});
