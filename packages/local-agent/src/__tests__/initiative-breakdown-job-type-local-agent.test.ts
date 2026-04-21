import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAllowedTools } from "../workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");

const EXECUTOR_FILE = path.join(REPO_ROOT, "packages", "local-agent", "src", "executor.ts");
const WORKSPACE_FILE = path.join(REPO_ROOT, "packages", "local-agent", "src", "workspace.ts");

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

describe("initiative-breakdown job type — local agent routing", () => {
  let executorSource = "";
  let workspaceSource = "";

  beforeAll(() => {
    executorSource = readSource(EXECUTOR_FILE);
    workspaceSource = readSource(WORKSPACE_FILE);
  });

  it("routes card type initiative-breakdown to role project-architect", () => {
    expect(executorSource).toMatch(/cardType\s*===\s*["']initiative-breakdown["']/);
    expect(executorSource).toMatch(
      /isInitiativeBreakdownJob[\s\S]{0,220}\?\s*["']project-architect["']/,
    );
  });

  it("includes project-architect in NO_CODE_CONTEXT_ROLES", () => {
    const noCodeBlock = executorSource.match(
      /NO_CODE_CONTEXT_ROLES\s*=\s*new Set\(\[[\s\S]*?\]\);/,
    );

    expect(noCodeBlock).not.toBeNull();
    expect(noCodeBlock![0]).toMatch(/["']project-architect["']/);
  });

  it("forwards ZAZIG_IDEA_ID from initiative-breakdown job context", () => {
    expect(executorSource).toMatch(
      /const\s+ideaId\s*=\s*\(isIdeaTriageJob\s*\|\|\s*isInitiativeBreakdownJob\)\s*\?\s*resolveIdeaId\(msg\)\s*:\s*undefined/,
    );
    expect(executorSource).toMatch(/setupJobWorkspace\([\s\S]{0,320}ideaId,[\s\S]{0,320}\)/);
    expect(workspaceSource).toMatch(/ZAZIG_IDEA_ID\s*:\s*env\.ideaId/);
  });

  it("on_hold poll path kills tmux session and sends job failed", () => {
    const onHoldBlock = executorSource.match(
      /if\s*\(alive\s*&&\s*job\.ideaId\s*&&\s*\(isIdeaTriageJob\s*\|\|\s*isInitiativeBreakdownJob\)\)[\s\S]{0,1200}/,
    );

    expect(onHoldBlock).not.toBeNull();
    expect(onHoldBlock![0]).toMatch(/ideaRow\?\.on_hold/);
    expect(onHoldBlock![0]).toMatch(/killTmuxSession\(job\.sessionName\)/);
    expect(onHoldBlock![0]).toMatch(/sendJobFailed\(jobId/);
  });

  it("workspace MCP tool defaults include the initiative-breakdown breakdown toolset", () => {
    const breakdownToolsBlock = workspaceSource.match(
      /const\s+BREAKDOWN_AGENT_MCP_TOOLS\s*=\s*\[[^\]]+\]/,
    );

    expect(breakdownToolsBlock).not.toBeNull();
    expect(breakdownToolsBlock![0]).toMatch(/["']ask_user["']/);
    expect(breakdownToolsBlock![0]).toMatch(/["']execute_sql["']/);
    expect(breakdownToolsBlock![0]).toMatch(/["']update_idea["']/);
    expect(breakdownToolsBlock![0]).toMatch(/["']query_ideas["']/);
    expect(breakdownToolsBlock![0]).toMatch(/["']batch_create_ideas["']/);

    const allowed = generateAllowedTools("project-architect");
    expect(allowed).toContain("mcp__zazig-messaging__ask_user");
    expect(allowed).toContain("mcp__zazig-messaging__execute_sql");
    expect(allowed).toContain("mcp__zazig-messaging__update_idea");
    expect(allowed).toContain("mcp__zazig-messaging__query_ideas");
    expect(allowed).toContain("mcp__zazig-messaging__batch_create_ideas");
  });
});
