/**
 * login.ts — zazig login
 *
 * Prompts for Supabase URL, anon key, and service-role key, validates them
 * against the Supabase API, then stores them in ~/.zazigv2/credentials.json.
 */

import { createInterface } from "node:readline/promises";
import { saveCredentials } from "../lib/credentials.js";

export async function login(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("Authenticate with your Supabase project credentials.");
  console.log(
    "These are stored at ~/.zazigv2/credentials.json (mode 600).\n"
  );

  try {
    const supabaseUrl = (await rl.question("Supabase URL: ")).trim();
    const anonKey = (await rl.question("Anon key: ")).trim();
    const serviceRoleKey = (await rl.question("Service role key: ")).trim();

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("All fields are required.");
      process.exitCode = 1;
      return;
    }

    // Validate by attempting a lightweight read (anon + service-role)
    process.stdout.write("\nValidating credentials...");
    try {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/machines?select=id&limit=1`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} — check your keys and URL`);
      }
      console.log(" OK");
    } catch (err) {
      console.log(" FAILED");
      console.error(`Credential validation failed: ${String(err)}`);
      process.exitCode = 1;
      return;
    }

    saveCredentials({ supabaseUrl, anonKey, serviceRoleKey });
    console.log(
      "\nCredentials saved. Run 'zazig join <company>' to configure your machine."
    );
  } finally {
    rl.close();
  }
}
