import { afterEach, describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildDaemonEnv } from "../start-env.js";

const ORIGINAL_ZAZIG_ENV = process.env["ZAZIG_ENV"];
const ORIGINAL_ZAZIG_HOME = process.env["ZAZIG_HOME"];

afterEach(() => {
  if (ORIGINAL_ZAZIG_ENV === undefined) {
    delete process.env["ZAZIG_ENV"];
  } else {
    process.env["ZAZIG_ENV"] = ORIGINAL_ZAZIG_ENV;
  }

  if (ORIGINAL_ZAZIG_HOME === undefined) {
    delete process.env["ZAZIG_HOME"];
  } else {
    process.env["ZAZIG_HOME"] = ORIGINAL_ZAZIG_HOME;
  }
});

describe("buildDaemonEnv", () => {
  it("forces production ZAZIG_ENV and ZAZIG_HOME even when parent env is staging", () => {
    process.env["ZAZIG_ENV"] = "staging";
    process.env["ZAZIG_HOME"] = join(homedir(), ".zazigv2-staging");

    const env = buildDaemonEnv({
      creds: {
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        supabaseUrl: "https://example.supabase.co",
      },
      config: {
        name: "test-machine",
        slots: { claude_code: 4, codex: 4 },
      },
      company: {
        id: "company-id",
        name: "Example Company",
      },
      zazigEnv: "production",
    });

    expect(env["ZAZIG_ENV"]).toBe("production");
    expect(env["ZAZIG_HOME"]).toBe(join(homedir(), ".zazigv2"));
  });
});
