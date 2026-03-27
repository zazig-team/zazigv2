/**
 * auto-triage.ts — zazig auto-triage
 *
 * Configure which item types are automatically triaged.
 *
 *   zazig auto-triage --company <id> --status
 *   zazig auto-triage --company <id> --enable idea,bug --disable brief,test
 */

import { automationConfig } from "../lib/automation-config.js";

export async function autoTriage(args: string[]): Promise<void> {
  await automationConfig({
    args,
    columnName: "auto_triage_types",
    label: "auto-triage",
  });
}
