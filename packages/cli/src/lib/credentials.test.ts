import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Credentials } from "./credentials.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFs: Record<string, string> = {};

vi.mock("node:fs", () => ({
  readFileSync: vi.fn((path: string) => {
    if (mockFs[path] !== undefined) return mockFs[path];
    throw new Error("ENOENT: no such file");
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    mockFs[path] = data;
  }),
  existsSync: vi.fn((path: string) => path in mockFs),
  mkdirSync: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      setSession: vi.fn(async () => ({
        data: {
          session: {
            access_token: "refreshed-access-token",
            refresh_token: "refreshed-refresh-token",
            user: { email: "test@test.com" },
          },
        },
        error: null,
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validCreds(): Credentials {
  return {
    supabaseUrl: "https://test.supabase.co",
    anonKey: "anon-key-123",
    refreshToken: "refresh-token-abc",
    accessToken: "access-token-xyz",
    userId: "user-uuid-123",
    companyId: "company-uuid-456",
  };
}

function credentialsPath(): string {
  const { homedir } = require("node:os");
  const { join } = require("node:path");
  return join(homedir(), ".zazigv2", "credentials.json");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("credentials", () => {
  beforeEach(() => {
    // Clear mockFs
    for (const key of Object.keys(mockFs)) {
      delete mockFs[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("credentialsExist returns false when file does not exist", async () => {
    const { credentialsExist } = await import("./credentials.js");
    expect(credentialsExist()).toBe(false);
  });

  it("credentialsExist returns true when file exists", async () => {
    const path = credentialsPath();
    mockFs[path] = JSON.stringify(validCreds());
    const { credentialsExist } = await import("./credentials.js");
    expect(credentialsExist()).toBe(true);
  });

  it("loadCredentials throws when no file exists", async () => {
    const { loadCredentials } = await import("./credentials.js");
    expect(() => loadCredentials()).toThrow("No credentials found");
  });

  it("loadCredentials throws when file has incomplete data", async () => {
    const path = credentialsPath();
    mockFs[path] = JSON.stringify({ supabaseUrl: "https://test.supabase.co" });
    const { loadCredentials } = await import("./credentials.js");
    expect(() => loadCredentials()).toThrow("Incomplete credentials");
  });

  it("loadCredentials returns valid credentials", async () => {
    const path = credentialsPath();
    const creds = validCreds();
    mockFs[path] = JSON.stringify(creds);
    const { loadCredentials } = await import("./credentials.js");
    expect(loadCredentials()).toEqual(creds);
  });

  it("saveCredentials writes file with mode 0o600", async () => {
    const { saveCredentials } = await import("./credentials.js");
    const { writeFileSync } = await import("node:fs");
    const creds = validCreds();
    saveCredentials(creds);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("credentials.json"),
      expect.stringContaining(creds.refreshToken),
      { mode: 0o600 }
    );
  });

  it("saveCredentials does not store service-role key", async () => {
    const { saveCredentials } = await import("./credentials.js");
    const { writeFileSync } = await import("node:fs");
    const creds = validCreds();
    saveCredentials(creds);
    const writtenData = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(writtenData).not.toContain("serviceRoleKey");
    expect(writtenData).not.toContain("service_role");
  });

  it("decodeJwtPayload extracts claims from a JWT", async () => {
    const { decodeJwtPayload } = await import("./credentials.js");
    // Create a fake JWT with a known payload
    const payload = { sub: "user-123", company_id: "company-456", exp: 9999999999 };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const fakeJwt = `header.${encodedPayload}.signature`;
    const decoded = decodeJwtPayload(fakeJwt);
    expect(decoded.sub).toBe("user-123");
    expect(decoded.company_id).toBe("company-456");
  });

  it("decodeJwtPayload throws on invalid JWT", async () => {
    const { decodeJwtPayload } = await import("./credentials.js");
    expect(() => decodeJwtPayload("not-a-jwt")).toThrow("Invalid JWT format");
  });

  it("getValidCredentials returns existing creds when token is valid", async () => {
    const path = credentialsPath();
    // Create a JWT with exp far in the future
    const payload = { sub: "user-123", company_id: "company-456", exp: Math.floor(Date.now() / 1000) + 3600 };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const validToken = `header.${encodedPayload}.signature`;
    const creds = { ...validCreds(), accessToken: validToken };
    mockFs[path] = JSON.stringify(creds);
    const { getValidCredentials } = await import("./credentials.js");
    const result = await getValidCredentials();
    expect(result.accessToken).toBe(validToken);
  });
});
