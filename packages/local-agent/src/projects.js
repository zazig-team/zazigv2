import { execFileSync } from "node:child_process";

/**
 * Load active projects for a company from `zazig projects --company <id>`.
 * Returns an empty list on command errors, malformed JSON, or missing fields.
 *
 * @param {string} companyId
 * @param {(file: string, args: readonly string[], options: { encoding: BufferEncoding; timeout: number }) => string} [runExecFileSync]
 * @returns {Array<{ name: string; repo_url: string }>}
 */
export function loadProjectsFromCLI(companyId, runExecFileSync = execFileSync) {
  try {
    const stdout = runExecFileSync("zazig", ["projects", "--company", companyId], {
      encoding: "utf8",
      timeout: 10_000,
    });
    const parsed = JSON.parse(stdout);
    const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];

    return projects
      .filter((project) => typeof project?.name === "string" && typeof project?.repo_url === "string")
      .map((project) => ({ name: project.name, repo_url: project.repo_url }));
  } catch (err) {
    console.warn("[daemon] Failed to load projects from CLI — continuing with empty list:", err);
    return [];
  }
}
