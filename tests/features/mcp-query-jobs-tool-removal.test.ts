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

function listSqlMigrations(): string[] {
  const migrationsDir = path.join(REPO_ROOT, "supabase/migrations");
  return fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
}

function migrationNumber(file: string): number {
  const [prefix] = file.split("_");
  const parsed = Number.parseInt(prefix, 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

describe("MCP query_jobs tool removal", () => {
  const file = "packages/local-agent/src/agent-mcp-server.ts";
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(file);
  });

  it("agent MCP server source file exists", () => {
    expect(content, `${file} not found`).not.toBeNull();
  });

  it("does not register query_jobs as an MCP tool", () => {
    expect(content).not.toMatch(/server\.tool\(\s*["']query_jobs["']/);
  });

  it("does not contain a query_jobs guarded handler", () => {
    expect(content).not.toMatch(/guardedHandler\(\s*["']query_jobs["']/);
  });
});

describe("roles.mcp_tools migration removes query_jobs", () => {
  const migrationsDir = path.join(REPO_ROOT, "supabase/migrations");

  it("includes a migration that removes query_jobs from roles.mcp_tools", () => {
    const migration = listSqlMigrations().find((file) => {
      const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      return (
        /update\s+roles/i.test(content) &&
        /mcp_tools/i.test(content) &&
        /array_remove[\s\S]*['"]query_jobs['"]/i.test(content)
      );
    });

    expect(
      migration,
      "Expected a migration that removes query_jobs from roles.mcp_tools (e.g. array_remove(..., 'query_jobs')).",
    ).toBeTruthy();
  });

  it("latest roles.mcp_tools migration mentioning query_jobs is a removal migration", () => {
    const candidates = listSqlMigrations()
      .map((file) => {
        const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        return { file, content, num: migrationNumber(file) };
      })
      .filter(({ content }) => {
        return /query_jobs/i.test(content) && /mcp_tools/i.test(content) && /update\s+roles/i.test(content);
      })
      .sort((a, b) => a.num - b.num);

    expect(candidates.length).toBeGreaterThan(0);

    const latest = candidates[candidates.length - 1];
    expect(latest?.content).toMatch(/array_remove[\s\S]*['"]query_jobs['"]/i);
    expect(latest?.content).not.toMatch(/array_append[\s\S]*['"]query_jobs['"]/i);
    expect(latest?.content).not.toMatch(/SET\s+mcp_tools\s*=\s*'[^']*query_jobs/i);
  });
});
