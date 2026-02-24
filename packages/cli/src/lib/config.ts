/**
 * config.ts — read/write ~/.zazigv2/config.json
 *
 * Stores machine configuration: name and slot counts.
 * Written on first `zazig start` if no config exists.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const CONFIG_PATH = join(ZAZIGV2_DIR, "config.json");

export interface SlotConfig {
  claude_code: number;
  codex: number;
}

export interface MachineConfig {
  /** Stable machine identifier — used as machineId in heartbeats and Realtime channel name. */
  name: string;
  /** Primary company UUID — the agent registers the machine under this company. */
  company_id?: string;
  slots: SlotConfig;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): MachineConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MachineConfig>;

    if (!parsed.name || typeof parsed.name !== "string") {
      throw new Error("config.json: missing or invalid 'name' field");
    }

    return {
      name: parsed.name,
      company_id: parsed.company_id,
      slots: {
        claude_code: parsed.slots?.claude_code ?? 4,
        codex: parsed.slots?.codex ?? 4,
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No machine config found at ${CONFIG_PATH}. Run 'zazig start' to configure.`
      );
    }
    throw err;
  }
}

export function saveConfig(cfg: MachineConfig): void {
  mkdirSync(ZAZIGV2_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", {
    mode: 0o600,
  });
}
