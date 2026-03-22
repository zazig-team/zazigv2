import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const LOG_DIR = join(ZAZIGV2_DIR, "logs");

describe("pidPathForCompany", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env["ZAZIG_ENV"];
  });

  it("returns {companyId}.pid in production", async () => {
    delete process.env["ZAZIG_ENV"];
    const { pidPathForCompany } = await import("./daemon.js");
    expect(pidPathForCompany("acme")).toBe(join(ZAZIGV2_DIR, "acme.pid"));
  });

  it("returns {companyId}-staging.pid in staging", async () => {
    process.env["ZAZIG_ENV"] = "staging";
    vi.resetModules();
    const { pidPathForCompany } = await import("./daemon.js");
    expect(pidPathForCompany("acme")).toBe(join(ZAZIGV2_DIR, "acme-staging.pid"));
  });
});

describe("logPathForCompany", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env["ZAZIG_ENV"];
  });

  it("returns {companyId}.log in production", async () => {
    delete process.env["ZAZIG_ENV"];
    vi.resetModules();
    const { logPathForCompany } = await import("./daemon.js");
    expect(logPathForCompany("acme")).toBe(join(LOG_DIR, "acme.log"));
  });

  it("returns {companyId}-staging.log in staging", async () => {
    process.env["ZAZIG_ENV"] = "staging";
    vi.resetModules();
    const { logPathForCompany } = await import("./daemon.js");
    expect(logPathForCompany("acme")).toBe(join(LOG_DIR, "acme-staging.log"));
  });
});
