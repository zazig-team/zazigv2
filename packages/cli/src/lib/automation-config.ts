/**
 * automation-config.ts — shared logic for auto-triage / auto-spec CLI commands
 *
 * Reads/writes the per-type automation array columns on the companies table
 * via PostgREST.
 */

import { getValidCredentials } from "./credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "./constants.js";

const VALID_TYPES = ["idea", "brief", "bug", "test"] as const;

interface AutomationConfigOptions {
  args: string[];
  columnName: string;
  label: string;
}

function parseCompanyFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--company");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function parseTypeList(args: string[], flag: string): string[] | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return [];
  return value.split(",").map((t) => t.trim().toLowerCase());
}

function validateTypes(types: string[]): string[] {
  const invalid = types.filter((t) => !(VALID_TYPES as readonly string[]).includes(t));
  if (invalid.length > 0) {
    console.error(`Invalid item type(s): ${invalid.join(", ")}`);
    console.error(`Valid types: ${VALID_TYPES.join(", ")}`);
    process.exit(1);
  }
  return types;
}

export async function automationConfig(opts: AutomationConfigOptions): Promise<void> {
  const { args, columnName, label } = opts;

  const companyId = parseCompanyFlag(args);
  if (!companyId) {
    console.error(`Usage: zazig ${label} --company <company-id> [--status] [--enable type,...] [--disable type,...]`);
    process.exit(1);
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exit(1);
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const supabaseUrl = creds.supabaseUrl;

  const showStatus = args.includes("--status");
  const enableTypes = parseTypeList(args, "--enable");
  const disableTypes = parseTypeList(args, "--disable");

  // If no action flags, default to --status
  if (!showStatus && !enableTypes && !disableTypes) {
    await printStatus(supabaseUrl, anonKey, creds.accessToken, companyId, columnName, label);
    return;
  }

  if (showStatus && !enableTypes && !disableTypes) {
    await printStatus(supabaseUrl, anonKey, creds.accessToken, companyId, columnName, label);
    return;
  }

  // Fetch current state
  const current = await fetchCurrentTypes(supabaseUrl, anonKey, creds.accessToken, companyId, columnName);
  const currentSet = new Set(current);

  if (enableTypes) {
    for (const t of validateTypes(enableTypes)) {
      currentSet.add(t);
    }
  }

  if (disableTypes) {
    for (const t of validateTypes(disableTypes)) {
      currentSet.delete(t);
    }
  }

  const updated = [...currentSet].sort();

  // Update via PostgREST
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${creds.accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ [columnName]: updated }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`Failed to update ${label}: ${resp.status} ${body}`);
    process.exit(1);
  }

  if (updated.length === 0) {
    console.log(`${label}: disabled (no types enabled)`);
  } else {
    console.log(`${label}: ${updated.join(", ")}`);
  }

  if (showStatus) {
    await printStatus(supabaseUrl, anonKey, creds.accessToken, companyId, columnName, label);
  }
}

async function fetchCurrentTypes(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  companyId: string,
  columnName: string,
): Promise<string[]> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/companies?id=eq.${companyId}&select=${columnName}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!resp.ok) {
    console.error(`Failed to fetch ${columnName}: ${resp.status}`);
    process.exit(1);
  }

  const rows = (await resp.json()) as Record<string, string[]>[];
  if (!rows.length) {
    console.error(`Company ${companyId} not found.`);
    process.exit(1);
  }

  return rows[0]![columnName] ?? [];
}

async function printStatus(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  companyId: string,
  columnName: string,
  label: string,
): Promise<void> {
  const types = await fetchCurrentTypes(supabaseUrl, anonKey, accessToken, companyId, columnName);

  console.log(`${label} status:`);
  for (const t of VALID_TYPES) {
    const enabled = types.includes(t);
    console.log(`  ${enabled ? "[x]" : "[ ]"} ${t}`);
  }
}
