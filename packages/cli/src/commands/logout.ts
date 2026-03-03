/**
 * logout.ts — zazig logout
 *
 * Removes stored credentials from ~/.zazigv2/credentials.json.
 */

import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function credentialsPath(): string {
  const env = process.env["ZAZIG_ENV"];
  const filename = env && env !== "production" ? `credentials-${env}.json` : "credentials.json";
  return join(homedir(), ".zazigv2", filename);
}

export function logout(): void {
  const p = credentialsPath();
  if (!existsSync(p)) {
    console.log("Not logged in.");
    return;
  }

  unlinkSync(p);
  console.log("Logged out.");
}
