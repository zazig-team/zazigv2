/**
 * auto-spec.ts — zazig auto-spec
 *
 * Configure which item types are automatically specced.
 *
 *   zazig auto-spec --company <id> --status
 *   zazig auto-spec --company <id> --enable idea,bug --disable brief,test
 */

import { automationConfig } from "../lib/automation-config.js";

export async function autoSpec(args: string[]): Promise<void> {
  await automationConfig({
    args,
    columnName: "auto_spec_types",
    label: "auto-spec",
  });
}
