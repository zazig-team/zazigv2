import { getValidCredentials } from "../lib/credentials.js";
import { fetchUserCompanies } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function companies(): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stdout.write(JSON.stringify({ "error": "Not logged in. Run zazig login first." }) + "\n");
    process.exit(1);
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const list = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);

  process.stdout.write(JSON.stringify({ "companies": list.map((c) => ({ "id": c.id, "name": c.name })) }) + "\n");
  process.exit(0);
}
