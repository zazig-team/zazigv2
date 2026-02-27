import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ZAZIG_DIR = join(homedir(), ".zazigv2");

export interface PersistentRoleSkills {
  role: string;
  skills: string[];
}

export interface SkillStatus {
  skill: string;
  state: "ok_symlink" | "symlink_mismatch" | "broken_symlink" | "copy" | "missing" | "source_missing";
  sourcePath: string | null;
  workspacePath: string;
  targetPath?: string;
}

export interface WorkspaceSkillStatus {
  role: string;
  workspaceDir: string;
  skills: SkillStatus[];
}

export interface SkillSyncSummary {
  workspaces: WorkspaceSkillStatus[];
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  warnings: string[];
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function resolveRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "..", ".."),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "projects", "skills")) && existsSync(join(candidate, ".claude", "skills"))) {
      return candidate;
    }
  }
  return process.cwd();
}

export async function fetchPersistentRoleSkills(
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
): Promise<PersistentRoleSkills[]> {
  const url = `${supabaseUrl}/functions/v1/company-persistent-jobs?company_id=${encodeURIComponent(companyId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch persistent roles (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }

  const rows = (await res.json()) as Array<{ role?: string; skills?: string[] }>;
  return rows
    .filter((r): r is { role: string; skills?: string[] } => typeof r.role === "string")
    .map((r) => ({ role: r.role, skills: Array.isArray(r.skills) ? r.skills : [] }));
}

function resolveSkillSourcePath(repoRoot: string, skillName: string): string | null {
  const pipelineRoot = join(repoRoot, "projects", "skills");
  const interactiveRoot = join(repoRoot, ".claude", "skills");

  const flatPipelinePath = join(pipelineRoot, `${skillName}.md`);
  if (existsSync(flatPipelinePath)) return flatPipelinePath;

  const nestedPipelinePath = join(pipelineRoot, skillName, "SKILL.md");
  if (existsSync(nestedPipelinePath)) return nestedPipelinePath;

  const interactivePath = join(interactiveRoot, skillName, "SKILL.md");
  if (existsSync(interactivePath)) return interactivePath;

  return null;
}

function collectRoleWorkspaces(companyId: string, role: string): string[] {
  const names = [
    `${companyId}-${role}-workspace`,
    `${role}-workspace`,
  ];
  const unique = new Set<string>();
  for (const name of names) {
    if (isUuid(role) && name === `${role}-workspace`) continue;
    const absPath = join(ZAZIG_DIR, name);
    if (existsSync(absPath)) unique.add(absPath);
  }
  return [...unique];
}

function inspectSkillStatus(workspaceSkillPath: string, sourcePath: string | null): SkillStatus["state"] {
  try {
    const stat = lstatSync(workspaceSkillPath);
    if (stat.isSymbolicLink()) {
      const target = resolve(dirname(workspaceSkillPath), readlinkSync(workspaceSkillPath));
      if (!existsSync(target)) return "broken_symlink";
      if (sourcePath && resolve(sourcePath) === target) return "ok_symlink";
      return "symlink_mismatch";
    }
    return sourcePath ? "copy" : "source_missing";
  } catch {
    return sourcePath ? "missing" : "source_missing";
  }
}

function readSkillTarget(workspaceSkillPath: string): string | undefined {
  try {
    if (!lstatSync(workspaceSkillPath).isSymbolicLink()) return undefined;
    return resolve(dirname(workspaceSkillPath), readlinkSync(workspaceSkillPath));
  } catch {
    return undefined;
  }
}

export function collectWorkspaceSkillStatus(
  companyId: string,
  roleSkills: PersistentRoleSkills[],
  repoRoot: string,
): WorkspaceSkillStatus[] {
  const statuses: WorkspaceSkillStatus[] = [];
  for (const { role, skills } of roleSkills) {
    const workspaceDirs = collectRoleWorkspaces(companyId, role);
    for (const workspaceDir of workspaceDirs) {
      const rows: SkillStatus[] = skills.map((skillName) => {
        const sourcePath = resolveSkillSourcePath(repoRoot, skillName);
        const workspacePath = join(workspaceDir, ".claude", "skills", skillName, "SKILL.md");
        return {
          skill: skillName,
          state: inspectSkillStatus(workspacePath, sourcePath),
          sourcePath,
          workspacePath,
          targetPath: readSkillTarget(workspacePath),
        };
      });
      statuses.push({ role, workspaceDir, skills: rows });
    }
  }
  return statuses;
}

export function syncWorkspaceSkills(
  companyId: string,
  roleSkills: PersistentRoleSkills[],
  repoRoot: string,
): SkillSyncSummary {
  const workspaces = collectWorkspaceSkillStatus(companyId, roleSkills, repoRoot);
  const summary: SkillSyncSummary = {
    workspaces,
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    warnings: [],
  };

  for (const workspace of workspaces) {
    const expected = new Set(workspace.skills.map((s) => s.skill));
    const skillsRoot = join(workspace.workspaceDir, ".claude", "skills");
    mkdirSync(skillsRoot, { recursive: true });

    for (const skill of workspace.skills) {
      if (!skill.sourcePath) {
        summary.warnings.push(`[skills] ${workspace.role}: source missing for "${skill.skill}"`);
        continue;
      }

      if (skill.state === "ok_symlink") {
        summary.unchanged += 1;
        continue;
      }

      mkdirSync(dirname(skill.workspacePath), { recursive: true });
      rmSync(skill.workspacePath, { recursive: true, force: true });

      try {
        symlinkSync(skill.sourcePath, skill.workspacePath);
      } catch (err) {
        copyFileSync(skill.sourcePath, skill.workspacePath);
        summary.warnings.push(
          `[skills] ${workspace.role}: symlink failed for "${skill.skill}", copied instead (${String(err)})`,
        );
      }

      if (skill.state === "missing") summary.added += 1;
      else summary.updated += 1;
    }

    const entries = readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (expected.has(entry.name)) continue;
      rmSync(join(skillsRoot, entry.name), { recursive: true, force: true });
      summary.removed += 1;
    }
  }

  return summary;
}
