import { launchUI } from "@zazig/tui";
import { loadConfig } from "../lib/config.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { isDaemonRunningForCompany, startDaemonForCompany } from "../lib/daemon.js";

// packages/tui workspace export used by zazig ui.
function parseCompanyFlag(args: string[]): string | undefined {
  const index = args.indexOf("--company");
  if (index === -1) return undefined;
  return args[index + 1];
}

function resolveCompanyFromFlag(
  companies: Array<{ id: string; name: string }>,
  companyFlag?: string,
): { id: string; name: string } | undefined {
  if (!companyFlag) return undefined;
  return companies.find((company) => company.id === companyFlag || company.name === companyFlag);
}

export async function ui(args: string[]): Promise<void> {
  let credentials;
  try {
    credentials = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(credentials.supabaseUrl, anonKey, credentials.accessToken);
  const companyFlag = parseCompanyFlag(args);
  const selectedFromFlag = resolveCompanyFromFlag(companies, companyFlag);

  if (companyFlag && !selectedFromFlag) {
    console.error(`Unknown company: ${companyFlag}`);
    process.exitCode = 1;
    return;
  }

  const selectedFromConfig = config.company_id
    ? companies.find((company) => company.id === config.company_id)
    : undefined;
  const company = selectedFromFlag ?? selectedFromConfig ?? (await pickCompany(companies));

  if (!isDaemonRunningForCompany(company.id)) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: credentials.accessToken,
      SUPABASE_REFRESH_TOKEN: credentials.refreshToken ?? "",
      SUPABASE_URL: credentials.supabaseUrl,
      ZAZIG_MACHINE_NAME: config.name,
      ZAZIG_COMPANY_ID: company.id,
      ZAZIG_COMPANY_NAME: company.name,
      ZAZIG_SLOTS_CLAUDE_CODE: String(config.slots?.claude_code ?? 3),
      ZAZIG_SLOTS_CODEX: String(config.slots?.codex ?? 2),
      ...(process.env["ZAZIG_HOME"] ? { ZAZIG_HOME: process.env["ZAZIG_HOME"] } : {}),
    };
    try {
      startDaemonForCompany(env, company.id);
    } catch (error) {
      console.error(`Failed to start daemon: ${String(error)}`);
      process.exitCode = 1;
      return;
    }
  }

  launchUI(company.id);
}
