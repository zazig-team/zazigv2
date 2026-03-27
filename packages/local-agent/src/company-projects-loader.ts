import { execFileSync } from "node:child_process";

export interface CompanyProject {
  name: string;
  repo_url: string;
}

type LoadCompanyProjectsFromCliOptions = {
  logPrefix: string;
};

/**
 * Loads active company projects from the zazig CLI.
 * Returns an empty list on parse/CLI errors so callers can continue running.
 */
export function loadCompanyProjectsFromCli(
  companyId: string,
  options: LoadCompanyProjectsFromCliOptions,
): CompanyProject[] {
  const logPrefix = options.logPrefix.trim().length > 0 ? options.logPrefix : "local-agent";

  try {
    const raw = execFileSync("zazig", ["projects", "--company", companyId], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(raw) as unknown;
    let projectRecords: unknown[] | null = null;
    if (Array.isArray(parsed)) {
      projectRecords = parsed;
    } else if (parsed && typeof parsed === "object") {
      const projects = (parsed as Record<string, unknown>)["projects"];
      if (Array.isArray(projects)) {
        projectRecords = projects;
      }
    }

    if (!projectRecords) {
      console.warn(
        `[${logPrefix}] Failed to parse projects from zazig projects --company ${companyId}: malformed JSON shape`,
      );
      return [];
    }

    const projects: CompanyProject[] = [];
    for (const project of projectRecords) {
      if (!project || typeof project !== "object") continue;
      const record = project as Record<string, unknown>;
      const status = typeof record["status"] === "string" ? record["status"] : "";
      if (status !== "active") continue;

      const name = typeof record["name"] === "string" ? record["name"].trim() : "";
      const repoUrl = typeof record["repo_url"] === "string" ? record["repo_url"].trim() : "";
      if (!name || !repoUrl) continue;
      projects.push({ name, repo_url: repoUrl });
    }

    return projects;
  } catch (err) {
    console.warn(
      `[${logPrefix}] Failed to load projects from zazig projects --company ${companyId}; continuing with empty project list`,
      err,
    );
    return [];
  }
}
