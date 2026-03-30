import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadConfig } from "../lib/config.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { isDaemonRunningForCompany, startDaemonForCompany } from "../lib/daemon.js";

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

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(credentials.supabaseUrl, anonKey, credentials.accessToken);
  const companyFlag = parseCompanyFlag(args);
  const selectedFromFlag = resolveCompanyFromFlag(companies, companyFlag);
  const company = selectedFromFlag ?? (await pickCompany(companies));
  const config = loadConfig();

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
    };
    startDaemonForCompany(env, company.id);
  }

  const tuiEntry = resolve(process.cwd(), "packages/tui/src/index.tsx");
  const child = spawn("bun", ["run", tuiEntry, "--company", company.id], {
    stdio: "inherit",
    env: process.env,
  });

  await new Promise<void>((resolvePromise) => {
    child.on("exit", (code) => {
      if (typeof code === "number" && code !== 0) process.exitCode = code;
      resolvePromise();
    });
  });
}
