import { basename } from "node:path";
import { getValidCredentials } from "../lib/credentials.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import {
  collectAvailableSkills,
  collectWorkspaceSkillStatus,
  fetchAllRoleSkills,
  fetchPersistentRoleSkills,
  resolveRepoRoot,
  syncWorkspaceSkills,
} from "../lib/skills.js";

interface Company {
  id: string;
  name: string;
}

function parseCompanyFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--company");
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function resolveCompany(companies: Company[], selected: Company, companyFlag?: string): Company {
  if (!companyFlag) return selected;
  const found = companies.find((c) => c.id === companyFlag || c.name === companyFlag);
  if (!found) {
    throw new Error(`Unknown company: ${companyFlag}`);
  }
  return found;
}

function printSkillStatus(state: ReturnType<typeof collectWorkspaceSkillStatus>): void {
  if (state.length === 0) {
    console.log("No persistent workspaces found for this company.");
    return;
  }

  for (const ws of state) {
    console.log(`Workspace: ${basename(ws.workspaceDir)} (${ws.role})`);
    if (ws.skills.length === 0) {
      console.log("  (no skills assigned)");
      continue;
    }

    for (const skill of ws.skills) {
      if (skill.state === "ok_symlink") {
        console.log(`  ${skill.skill.padEnd(20)} ✓ symlink -> ${skill.targetPath}`);
      } else if (skill.state === "missing") {
        console.log(`  ${skill.skill.padEnd(20)} ✗ missing in workspace`);
      } else if (skill.state === "copy") {
        console.log(`  ${skill.skill.padEnd(20)} ~ copied file (not symlink)`);
      } else if (skill.state === "broken_symlink") {
        console.log(`  ${skill.skill.padEnd(20)} ✗ broken symlink`);
      } else if (skill.state === "symlink_mismatch") {
        console.log(`  ${skill.skill.padEnd(20)} ~ symlink target mismatch`);
      } else {
        console.log(`  ${skill.skill.padEnd(20)} ✗ source missing in repo`);
      }
    }
    console.log("");
  }
}

function printSyncSummary(summary: ReturnType<typeof syncWorkspaceSkills>): void {
  console.log(
    `Done. added=${summary.added}, updated=${summary.updated}, removed=${summary.removed}, unchanged=${summary.unchanged}`,
  );
  if (summary.warnings.length > 0) {
    for (const warning of summary.warnings) {
      console.warn(warning);
    }
  }
}

function printAllRoleSkills(roleSkills: Awaited<ReturnType<typeof fetchAllRoleSkills>>): void {
  console.log("Role Skills (all roles):");

  if (roleSkills.length === 0) {
    console.log("  (none)");
    console.log("");
    return;
  }

  const sorted = [...roleSkills].sort((a, b) => a.role.localeCompare(b.role));
  const maxRoleWidth = sorted.reduce((max, row) => Math.max(max, row.role.length), 0);
  for (const row of sorted) {
    const skillText = row.skills.length > 0 ? row.skills.join(", ") : "(none)";
    console.log(`  ${row.role.padEnd(maxRoleWidth)}   ${skillText}`);
  }
  console.log("");
}

function printAvailableSkills(available: ReturnType<typeof collectAvailableSkills>): void {
  const pipeline = available.pipeline.length > 0 ? available.pipeline.join(", ") : "(none)";
  const interactive = available.interactive.length > 0 ? available.interactive.join(", ") : "(none)";

  console.log("Available Skills (repo):");
  console.log(`  Pipeline:    ${pipeline}`);
  console.log(`  Interactive: ${interactive}`);
}

async function loadContext(args: string[]): Promise<{
  company: Company;
  anonKey: string;
  supabaseUrl: string;
  accessToken: string;
}> {
  const creds = await getValidCredentials();
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  const selected = await pickCompany(companies);
  const company = resolveCompany(companies, selected, parseCompanyFlag(args));
  return { company, anonKey, supabaseUrl: creds.supabaseUrl, accessToken: creds.accessToken };
}

export async function skills(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "status" && subcommand !== "sync") {
    console.error("Usage: zazig skills <status|sync> [--company <id|name>]");
    process.exitCode = 1;
    return;
  }

  let context;
  try {
    context = await loadContext(rest);
  } catch (err) {
    console.error(`Failed to load credentials/company context: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const repoRoot = resolveRepoRoot();
  let roleSkills;
  try {
    roleSkills = await fetchPersistentRoleSkills(context.supabaseUrl, context.anonKey, context.company.id);
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  if (subcommand === "status") {
    const status = collectWorkspaceSkillStatus(context.company.id, roleSkills, repoRoot);
    printSkillStatus(status);

    let allRoleSkills;
    try {
      allRoleSkills = await fetchAllRoleSkills(
        context.supabaseUrl,
        context.anonKey,
        context.accessToken,
        context.company.id,
      );
    } catch (err) {
      console.error(String(err));
      process.exitCode = 1;
      return;
    }

    const availableSkills = collectAvailableSkills(repoRoot);
    printAllRoleSkills(allRoleSkills);
    printAvailableSkills(availableSkills);
    return;
  }

  const summary = syncWorkspaceSkills(context.company.id, roleSkills, repoRoot);
  printSyncSummary(summary);
}

export async function syncSkillsForCompany(
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
): Promise<ReturnType<typeof syncWorkspaceSkills>> {
  const repoRoot = resolveRepoRoot();
  const roleSkills = await fetchPersistentRoleSkills(supabaseUrl, anonKey, companyId);
  return syncWorkspaceSkills(companyId, roleSkills, repoRoot);
}
