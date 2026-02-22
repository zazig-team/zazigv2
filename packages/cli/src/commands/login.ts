/**
 * login.ts — zazig login
 *
 * Authenticates via Supabase Auth (email/password). The user must already
 * exist from the web UI signup. Stores the session's refresh token, access
 * token, and derived company_id in ~/.zazigv2/credentials.json.
 *
 * If the user belongs to multiple companies, prompts for selection.
 * If no machine.yaml exists, prompts for machine name and slots.
 */

import { createInterface } from "node:readline/promises";
import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { saveCredentials, decodeJwtPayload } from "../lib/credentials.js";
import { configExists, saveConfig } from "../lib/config.js";

export async function login(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("Authenticate with your Supabase account.");
  console.log(
    "Credentials are stored at ~/.zazigv2/credentials.json (mode 600).\n"
  );

  try {
    // Supabase URL and anon key: prefer env vars, fall back to prompt
    const envUrl = process.env["SUPABASE_URL"];
    const envAnon = process.env["SUPABASE_ANON_KEY"];

    const supabaseUrl = envUrl
      ? (console.log(`Supabase URL: ${envUrl} (from env)`), envUrl)
      : (await rl.question("Supabase URL: ")).trim();

    const anonKey = envAnon
      ? (console.log(`Anon key: (from env)`), envAnon)
      : (await rl.question("Anon key: ")).trim();

    if (!supabaseUrl || !anonKey) {
      console.error("Supabase URL and anon key are required.");
      process.exitCode = 1;
      return;
    }

    const email = (await rl.question("Email: ")).trim();
    const password = (await rl.question("Password: ")).trim();

    if (!email || !password) {
      console.error("Email and password are required.");
      process.exitCode = 1;
      return;
    }

    // Authenticate via Supabase Auth
    process.stdout.write("\nAuthenticating...");
    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      console.log(" FAILED");
      console.error(
        `Authentication failed: ${error?.message ?? "no session returned"}`
      );
      process.exitCode = 1;
      return;
    }
    console.log(" OK");

    const session = data.session;
    const user = data.user;

    // Extract company_id from JWT claims or user metadata
    let companyId: string | undefined;
    const jwtPayload = decodeJwtPayload(session.access_token);

    // Try top-level JWT claim first (set by custom access token hook)
    if (typeof jwtPayload.company_id === "string") {
      companyId = jwtPayload.company_id;
    }
    // Fall back to app_metadata
    if (!companyId) {
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
      if (typeof appMeta.company_id === "string") {
        companyId = appMeta.company_id;
      }
    }

    // Multi-company: check for companies array
    if (!companyId) {
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
      const companies = appMeta.companies as
        | Array<{ id: string; name: string }>
        | undefined;

      if (companies && companies.length > 0) {
        if (companies.length === 1) {
          companyId = companies[0]!.id;
          console.log(`Company: ${companies[0]!.name}`);
        } else {
          console.log("\nYou belong to multiple companies:");
          for (let i = 0; i < companies.length; i++) {
            console.log(`  [${i + 1}] ${companies[i]!.name}`);
          }
          const choice = (
            await rl.question(`Select company [1-${companies.length}]: `)
          ).trim();
          const idx = parseInt(choice, 10) - 1;
          if (idx < 0 || idx >= companies.length) {
            console.error("Invalid selection.");
            process.exitCode = 1;
            return;
          }
          companyId = companies[idx]!.id;
          console.log(`Selected: ${companies[idx]!.name}`);
        }
      }
    }

    if (!companyId) {
      console.error(
        "\nCould not determine company_id from your account. " +
          "Ensure your account is associated with a company in the web UI."
      );
      process.exitCode = 1;
      return;
    }

    // Save credentials (no service-role key!)
    saveCredentials({
      supabaseUrl,
      anonKey,
      refreshToken: session.refresh_token,
      accessToken: session.access_token,
      userId: user.id,
      companyId,
    });

    console.log(`\nCredentials saved. Logged in as ${email}.`);

    // If no machine config exists, prompt for setup
    if (!configExists()) {
      console.log("\nNo machine config found. Let's set it up.\n");
      const defaultName = hostname().split(".")[0] ?? hostname();

      const nameInput = (
        await rl.question(`Machine name [${defaultName}]: `)
      ).trim();
      const machineName = nameInput || defaultName;

      const claudeInput = (
        await rl.question("Claude Code slots [1]: ")
      ).trim();
      const claudeSlots = claudeInput ? parseInt(claudeInput, 10) : 1;
      if (!Number.isInteger(claudeSlots) || claudeSlots < 0) {
        console.error("Slots must be a non-negative integer.");
        process.exitCode = 1;
        return;
      }

      const codexInput = (await rl.question("Codex slots [0]: ")).trim();
      const codexSlots = codexInput ? parseInt(codexInput, 10) : 0;
      if (!Number.isInteger(codexSlots) || codexSlots < 0) {
        console.error("Slots must be a non-negative integer.");
        process.exitCode = 1;
        return;
      }

      saveConfig({
        name: machineName,
        slots: { claude_code: claudeSlots, codex: codexSlots },
        supabase: { url: supabaseUrl },
      });

      console.log(`\nMachine config saved.`);
      console.log(`  Name: ${machineName}`);
      console.log(
        `  Slots: claude_code=${claudeSlots}, codex=${codexSlots}`
      );
    }

    console.log("Run 'zazig start' to launch the agent daemon.");
  } finally {
    rl.close();
  }
}
