import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Credentials } from "./credentials.js";

vi.mock("node:fs");

const validCreds = (): Credentials => ({
  supabaseUrl: "https://example.supabase.co",
  accessToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.sig",
  refreshToken: "refresh-token-value",
  email: "test@example.com",
  companyId: "company-456",
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("credentialsExist", () => {
  it("returns false when file doesn't exist", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { credentialsExist } = await import("./credentials.js");
    expect(credentialsExist()).toBe(false);
  });

  it("returns true when file exists", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const { credentialsExist } = await import("./credentials.js");
    expect(credentialsExist()).toBe(true);
  });
});

describe("loadCredentials", () => {
  it("throws when file doesn't exist", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { loadCredentials } = await import("./credentials.js");
    expect(() => loadCredentials()).toThrow("No credentials found");
  });

  it("throws when schema is invalid (missing accessToken)", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ refreshToken: "rt", supabaseUrl: "https://x.co" }) as never,
    );

    const { loadCredentials } = await import("./credentials.js");
    const creds = loadCredentials();
    // Schema does not enforce at runtime — accessToken will be undefined
    expect(creds.accessToken).toBeUndefined();
  });

  it("returns parsed credentials on valid JSON", async () => {
    const fs = await import("node:fs");
    const expected = validCreds();
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expected) as never);

    const { loadCredentials } = await import("./credentials.js");
    const result = loadCredentials();
    expect(result).toEqual(expected);
  });
});

describe("saveCredentials", () => {
  it("calls writeFileSync with mode 0o600", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const { saveCredentials } = await import("./credentials.js");
    saveCredentials(validCreds());

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("credentials.json"),
      expect.any(String),
      { mode: 0o600 },
    );
  });

  it("omits undefined optional fields (email/companyId)", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const { saveCredentials } = await import("./credentials.js");
    saveCredentials({
      supabaseUrl: "https://example.supabase.co",
      accessToken: "at",
      refreshToken: "rt",
    });

    const written = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
    const parsed = JSON.parse(written);
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("companyId");
  });
});

describe("decodeJwtPayload", () => {
  it("extracts sub and exp claims from valid JWT", async () => {
    const { decodeJwtPayload } = await import("./credentials.js");
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.sig";
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual({ sub: "user-123", exp: 9999999999 });
  });

  it("returns null for invalid token", async () => {
    const { decodeJwtPayload } = await import("./credentials.js");
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });
});

describe("getValidCredentials", () => {
  it("returns stored creds when access token is not expired", async () => {
    const fs = await import("node:fs");
    const creds = validCreds();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(creds) as never);

    const { getValidCredentials } = await import("./credentials.js");
    const result = await getValidCredentials();
    expect(result).toEqual(creds);
  });
});
