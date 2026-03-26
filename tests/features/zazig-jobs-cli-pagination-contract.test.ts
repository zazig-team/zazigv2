import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

describe("zazig jobs CLI command", () => {
  const file = "packages/cli/src/commands/jobs.ts";
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(file);
  });

  it("exists as a dedicated jobs command file", () => {
    expect(content, `${file} not found`).not.toBeNull();
  });

  it("exports a jobs command handler", () => {
    expect(content).toMatch(/export\s+(async\s+)?function\s+jobs/);
  });

  it("has --help usage text documenting required and optional flags", () => {
    expect(content).toMatch(/usage|Usage/);
    expect(content).toMatch(/--company/);
    expect(content).toMatch(/--id/);
    expect(content).toMatch(/--feature-id/);
    expect(content).toMatch(/--status/);
    expect(content).toMatch(/--limit/);
    expect(content).toMatch(/--offset/);
  });

  it("calls query-jobs edge function with POST and JSON payload", () => {
    expect(content).toContain("query-jobs");
    expect(content).toMatch(/method\s*:\s*["']POST["']/);
    expect(content).toMatch(/JSON\.stringify/);
  });

  it("defaults pagination to limit 20 and offset 0", () => {
    expect(content).toMatch(/limit[^\n]*\?\?\s*20|limit[^\n]*=\s*20/);
    expect(content).toMatch(/offset[^\n]*\?\?\s*0|offset[^\n]*=\s*0/);
  });

  it("passes feature-id, status, id, limit, and offset to the query payload", () => {
    expect(content).toMatch(/feature[_-]?id|featureId/);
    expect(content).toMatch(/status/);
    expect(content).toMatch(/job[_-]?id|\bid\b/);
    expect(content).toMatch(/\blimit\b/);
    expect(content).toMatch(/\boffset\b/);
  });

  it("writes JSON results to stdout", () => {
    expect(content).toMatch(/process\.stdout\.write\(JSON\.stringify\(/);
  });
});

describe("CLI entrypoint wiring for zazig jobs", () => {
  const file = "packages/cli/src/index.ts";
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(file);
  });

  it("imports jobs command", () => {
    expect(content).toMatch(/import\s+\{\s*jobs\s*\}\s+from\s+["']\.\/commands\/jobs\.js["']/);
  });

  it("routes case \"jobs\" to jobs(args)", () => {
    expect(content).toMatch(/case\s+["']jobs["']\s*:\s*[\s\S]*await\s+jobs\(args\)/);
  });
});

describe("query-jobs edge function limit/offset behavior", () => {
  const file = "supabase/functions/query-jobs/index.ts";
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(file);
  });

  it("reads limit and offset from request body", () => {
    expect(content).toMatch(/\{[\s\S]*job_id[\s\S]*feature_id[\s\S]*status[\s\S]*limit[\s\S]*offset[\s\S]*\}\s*=\s*body/);
  });

  it("defaults to limit 20 and offset 0 when omitted", () => {
    expect(content).toMatch(/limit[^\n]*\?\?\s*20|limit[^\n]*=\s*20/);
    expect(content).toMatch(/offset[^\n]*\?\?\s*0|offset[^\n]*=\s*0/);
  });

  it("supports status-only queries by allowing status as a valid selector", () => {
    expect(content).toMatch(/if\s*\(\s*!job_id\s*&&\s*!feature_id\s*&&\s*!status\s*\)/);
  });

  it("applies pagination to non-id queries", () => {
    expect(content).toMatch(/\.range\(|\.limit\(/);
  });

  it("keeps single-job lookups in a dedicated job_id branch", () => {
    expect(content).toMatch(/if\s*\(\s*job_id\s*\)/);
    expect(content).toMatch(/\.single\(\)/);
  });
});

describe("prompt-layer docs include zazig jobs read command", () => {
  const file = "supabase/functions/_shared/prompt-layers.ts";
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(file);
  });

  it("lists zazig jobs with id/feature-id/status/limit/offset flags", () => {
    expect(content).toContain("zazig jobs");
    expect(content).toMatch(/--id/);
    expect(content).toMatch(/--feature-id/);
    expect(content).toMatch(/--status/);
    expect(content).toMatch(/--limit/);
    expect(content).toMatch(/--offset/);
  });
});
