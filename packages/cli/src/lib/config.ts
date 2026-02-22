/**
 * config.ts — read/write ~/.zazigv2/machine.yaml
 *
 * The machine.yaml format is shared with the local-agent; this module only
 * handles writing it during `zazig login`. Reading is done by the local-agent
 * at runtime via its own config loader.
 *
 * company_id is no longer stored here — it is derived from the authenticated
 * user's JWT claim at runtime.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const CONFIG_PATH = join(ZAZIGV2_DIR, "machine.yaml");

export interface MachineConfig {
  name: string;
  slots: {
    claude_code: number;
    codex: number;
  };
  supabase: {
    url: string;
  };
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): MachineConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return yamlParse(raw) as MachineConfig;
  } catch {
    throw new Error("No machine config. Run 'zazig login' to configure.");
  }
}

export function saveConfig(cfg: MachineConfig): void {
  mkdirSync(ZAZIGV2_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, yamlStringify(cfg));
}
