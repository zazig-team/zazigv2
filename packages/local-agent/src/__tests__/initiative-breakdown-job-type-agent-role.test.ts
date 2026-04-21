import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");

function readInitiativeBreakdownRoleMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const target = files.find((file) =>
    file.includes("project_architect_initiative_breakdown_prompt")
  );

  if (!target) {
    throw new Error(
      "Could not find initiative-breakdown role prompt migration in supabase/migrations",
    );
  }

  return fs.readFileSync(path.join(MIGRATIONS_DIR, target), "utf-8");
}

describe("initiative-breakdown job type — project-architect role prompt", () => {
  const migration = readInitiativeBreakdownRoleMigration();

  it("instructs reading the parent idea record and conversation history", () => {
    expect(migration).toMatch(/Step 1 - Read the enriched parent idea/);
    expect(migration).toMatch(/Step 2 - Read conversation history/);
    expect(migration).toMatch(/read the idea row by context\.idea_id/i);
    expect(migration).toMatch(/read idea_messages for context\.idea_id/i);
  });

  it("instructs calling batch_create_ideas for child ideas", () => {
    expect(migration).toMatch(/Call batch_create_ideas to create each child idea/);
    expect(migration).toMatch(/["']batch_create_ideas["']/);
  });

  it("enforces parent:<uuid> tagging on child ideas", () => {
    expect(migration).toMatch(/tags:\s*include\s*parent:<parent_idea_uuid>/i);
  });

  it("prohibits setting project_id on child ideas", () => {
    expect(migration).toMatch(/Do NOT set project_id on child ideas/);
  });

  it("instructs writing .reports/initiative-breakdown-report.md", () => {
    expect(migration).toMatch(/\.reports\/initiative-breakdown-report\.md/);
  });

  it("does not instruct calling update_idea(status='spawned') as an action", () => {
    expect(migration).toMatch(/Do NOT call update_idea\(status='spawned'\)/);
    expect(migration).toMatch(/orchestrator handles that transition/i);
    expect(migration).not.toMatch(
      /(^|\n)\s*-\s*Call\s+update_idea\(status=['"]spawned['"]\)/,
    );
  });
});
