import { getValidCredentials, type Credentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { fetchUserCompanies } from "../lib/company-picker.js";

export async function companies(): Promise<void> {
  let creds: Credentials | null = null;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stdout.write(JSON.stringify({ "error": "Not logged in. Run zazig login first." }));
    process.exit(1);
  }

  if (!creds) {
    process.stdout.write(JSON.stringify({ "error": "Not logged in. Run zazig login first." }));
    process.exit(1);
  }

  try {
    const companiesList = await fetchUserCompanies(
      creds.supabaseUrl,
      DEFAULT_SUPABASE_ANON_KEY,
      creds.accessToken,
    );
    process.stdout.write(
      JSON.stringify({
        "companies": companiesList.map((company) => ({ "id": company.id, "name": company.name })),
      }),
    );
    process.exit(0);
  } catch {
    process.stdout.write(JSON.stringify({ "error": "Failed to fetch companies." }));
    process.exit(1);
  }
}
