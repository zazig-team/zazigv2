/**
 * logout.ts — zazig logout
 *
 * Removes stored credentials from ~/.zazigv2/credentials.json.
 */

import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json");

export function logout(): void {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.log("Not logged in.");
    return;
  }

  unlinkSync(CREDENTIALS_PATH);
  console.log("Logged out.");
}
