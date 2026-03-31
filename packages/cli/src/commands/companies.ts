/**
 * companies.ts — zazig companies
 *
 * Lists all companies the authenticated user belongs to as JSON.
 * Always outputs machine-readable JSON to stdout.
 */

import { getValidCredentials } from "../lib/credentials.js";
import { fetchUserCompanies } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function companies(_args: string[] = []): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stdout.write(JSON.stringify({ "error": "Not logged in. Run 'zazig login' first." }) + "\n");
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;

  let companiesList;
  try {
    companiesList = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  } catch (err) {
    process.stdout.write(JSON.stringify({ "error": `Failed to fetch companies: ${String(err)}` }) + "\n");
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  const output = {
    "companies": companiesList.map((c) => ({ "id": c.id, "name": c.name })),
  };

  process.stdout.write(JSON.stringify(output) + "\n");
  process.exit(0);
}
