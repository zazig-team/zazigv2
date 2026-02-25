/**
 * skills.ts — zazig skills status | zazig skills sync
 *
 * Inspects and manages skill symlinks across agent workspaces.
 */

import {
  readdirSync,
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveRepoRoot } from "../lib/repo-root.js";

/** Maps roles to the skill names they should have installed. */
export const ROLE_SKILLS: Record<string, string[]> = {
  cpo: ["standup", "cardify", "spec-feature", "review-plan", "scrum", "cpo"],
  cto: [
    "cto",
    "healthcheck",
    "repo-recon",
    "deep-research",
    "multi-agent-review",
  ],
  "breakdown-specialist": ["napkin"],
};

interface WorkspaceInfo {
  dirName: string;
  dirPath: string;
  companyId: string;
  role: string;
}

/**
 * Discover all agent workspaces under ~/.zazigv2/ that match
 * the {companyId}-{role}-workspace naming convention.
 */
function discoverWorkspaces(): WorkspaceInfo[] {
  const zazigDir = join(homedir(), ".zazigv2");
  if (!existsSync(zazigDir)) return [];

  const entries = readdirSync(zazigDir, { withFileTypes: true });
  const workspaces: WorkspaceInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith("-workspace")) continue;

    const dirPath = join(zazigDir, entry.name);
    const settingsPath = join(dirPath, ".claude", "settings.json");
    if (!existsSync(settingsPath)) continue;

    // Parse role from directory name: {uuid}-{role}-workspace
    const withoutSuffix = entry.name.replace(/-workspace$/, "");
    const uuidPattern =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/;
    const match = withoutSuffix.match(uuidPattern);

    let companyId: string;
    let role: string;

    if (match) {
      companyId = match[1]!;
      role = match[2]!;
    } else {
      // Fallback: no UUID prefix, entire name before -workspace is the role
      companyId = "unknown";
      role = withoutSuffix;
    }

    workspaces.push({ dirName: entry.name, dirPath, companyId, role });
  }

  return workspaces;
}

/**
 * Resolve the source path for a skill, checking paths in order:
 *   1. {repoRoot}/projects/skills/{name}/SKILL.md
 *   2. {repoRoot}/projects/skills/{name}.md
 *   3. {repoRoot}/.claude/skills/{name}/SKILL.md
 */
function resolveSkillSource(repoRoot: string, name: string): string | null {
  const candidates = [
    join(repoRoot, "projects", "skills", name, "SKILL.md"),
    join(repoRoot, "projects", "skills", `${name}.md`),
    join(repoRoot, ".claude", "skills", name, "SKILL.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Describe the state of a skill file at the given destination path.
 */
function describeSkill(destPath: string): {
  status: "missing" | "symlink" | "broken-symlink" | "copy";
  target?: string;
} {
  try {
    const stat = lstatSync(destPath);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(destPath);
      // Check if symlink target actually exists
      if (existsSync(destPath)) {
        return { status: "symlink", target };
      }
      return { status: "broken-symlink", target };
    }
    return { status: "copy" };
  } catch {
    return { status: "missing" };
  }
}

export async function skillsStatus(): Promise<void> {
  const workspaces = discoverWorkspaces();

  if (workspaces.length === 0) {
    console.log("No agent workspaces found in ~/.zazigv2/");
    return;
  }

  for (let i = 0; i < workspaces.length; i++) {
    const ws = workspaces[i]!;
    const skills = ROLE_SKILLS[ws.role] ?? [];
    const roleLabel = ws.role.toUpperCase();

    console.log(`Workspace: ${ws.dirName} (${roleLabel})`);

    if (skills.length === 0) {
      console.log("  (no skills configured for this role)");
    } else {
      // Calculate column width for alignment
      const maxNameLen = Math.max(...skills.map((s) => s.length));

      for (const name of skills) {
        const destPath = join(ws.dirPath, ".claude", "skills", name, "SKILL.md");
        const info = describeSkill(destPath);
        const label = name.padEnd(maxNameLen + 4);

        switch (info.status) {
          case "symlink":
            console.log(`  ${label}symlink -> ${info.target}`);
            break;
          case "broken-symlink":
            console.log(`  ${label}broken symlink -> ${info.target}`);
            break;
          case "copy":
            console.log(`  ${label}copy`);
            break;
          case "missing":
            console.log(`  ${label}MISSING`);
            break;
        }
      }
    }

    if (i < workspaces.length - 1) console.log("");
  }
}

export async function skillsSync(): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = resolveRepoRoot();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const workspaces = discoverWorkspaces();

  if (workspaces.length === 0) {
    console.log("No agent workspaces found in ~/.zazigv2/");
    return;
  }

  let changeCount = 0;

  for (const ws of workspaces) {
    const skills = ROLE_SKILLS[ws.role] ?? [];
    const roleLabel = ws.role.toUpperCase();

    console.log(`Workspace: ${ws.dirName} (${roleLabel})`);

    if (skills.length === 0) {
      console.log("  (no skills configured for this role)");
      continue;
    }

    for (const name of skills) {
      const source = resolveSkillSource(repoRoot, name);

      if (!source) {
        console.log(`  ${name}: source not found — skipped`);
        continue;
      }

      const destDir = join(ws.dirPath, ".claude", "skills", name);
      const destPath = join(destDir, "SKILL.md");
      const info = describeSkill(destPath);

      switch (info.status) {
        case "symlink":
          if (info.target === source) {
            console.log(`  ${name}: ok`);
          } else {
            unlinkSync(destPath);
            symlinkSync(source, destPath);
            console.log(`  ${name}: updated symlink target`);
            changeCount++;
          }
          break;

        case "broken-symlink":
          unlinkSync(destPath);
          symlinkSync(source, destPath);
          console.log(`  ${name}: repaired broken symlink`);
          changeCount++;
          break;

        case "copy":
          unlinkSync(destPath);
          symlinkSync(source, destPath);
          console.log(`  ${name}: replaced copy with symlink`);
          changeCount++;
          break;

        case "missing":
          mkdirSync(destDir, { recursive: true });
          symlinkSync(source, destPath);
          console.log(`  ${name}: created symlink`);
          changeCount++;
          break;
      }
    }
  }

  console.log("");
  console.log(
    changeCount === 0
      ? "All skills up to date."
      : `Done. ${changeCount} change${changeCount === 1 ? "" : "s"} made.`
  );
}

export async function skills(args: string[]): Promise<void> {
  const [subcommand] = args;

  switch (subcommand) {
    case "status":
      await skillsStatus();
      break;
    case "sync":
      await skillsSync();
      break;
    default:
      console.error("Usage: zazig skills <status|sync>");
      console.error("");
      console.error("  status    Show skill distribution status for all agent workspaces");
      console.error("  sync      Sync skills as symlinks to all agent workspaces");
      process.exitCode = 1;
  }
}
