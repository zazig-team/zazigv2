/**
 * join.ts — zazig join <company>
 *
 * Looks up a company by name in Supabase, then prompts for:
 *   - Machine name (default: hostname)
 *   - Claude Code slots (default: 1)
 *   - Codex slots (default: 0)
 *
 * Writes the resulting config to ~/.zazigv2/machine.yaml.
 */

import { createInterface } from "node:readline/promises";
import { hostname } from "node:os";
import { loadCredentials } from "../lib/credentials.js";
import { saveConfig } from "../lib/config.js";

export async function join(company: string | undefined): Promise<void> {
  if (!company) {
    console.error("Usage: zazig join <company>");
    process.exitCode = 1;
    return;
  }

  let creds;
  try {
    creds = loadCredentials();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  // Look up company by name
  process.stdout.write(`Looking up company "${company}"...`);
  let companyId: string;
  let companyName: string;
  try {
    const resp = await fetch(
      `${creds.supabaseUrl}/rest/v1/companies?select=id,name&name=eq.${encodeURIComponent(company)}&limit=1`,
      {
        headers: {
          apikey: creds.anonKey,
          Authorization: `Bearer ${creds.anonKey}`,
        },
      }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rows = (await resp.json()) as Array<{ id: string; name: string }>;
    if (rows.length === 0) {
      console.log(" not found");
      console.error(`Company "${company}" not found. Check the name and try again.`);
      process.exitCode = 1;
      return;
    }
    companyId = rows[0]!.id;
    companyName = rows[0]!.name;
    console.log(` found`);
  } catch (err) {
    console.log(" error");
    console.error(`Failed to look up company: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const defaultName = hostname().split(".")[0] ?? hostname();

    const nameInput = (
      await rl.question(`Machine name [${defaultName}]: `)
    ).trim();
    const machineName = nameInput || defaultName;

    const claudeInput = (await rl.question("Claude Code slots [1]: ")).trim();
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
      company_id: companyId,
      slots: { claude_code: claudeSlots, codex: codexSlots },
      supabase: { url: creds.supabaseUrl },
    });

    console.log(`\nJoined "${companyName}" as "${machineName}".`);
    console.log(`  Slots: claude_code=${claudeSlots}, codex=${codexSlots}`);
    console.log("Run 'zazig start' to launch the agent daemon.");
  } finally {
    rl.close();
  }
}
