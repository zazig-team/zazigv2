#!/usr/bin/env node
/**
 * @zazig/cli — entry point
 *
 * Dispatches to command handlers based on process.argv.
 * No external argument-parsing dependency — keeps the package minimal.
 *
 * Usage:
 *   zazig login
 *   zazig setup
 *   zazig start
 *   zazig stop
 *   zazig status
 */

import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { setup } from "./commands/setup.js";
import { start } from "./commands/start.js";
import { stop } from "./commands/stop.js";
import { status } from "./commands/status.js";
import { personality } from "./commands/personality.js";
import { chat } from "./commands/chat.js";
import { skills } from "./commands/skills.js";
import { promote } from "./commands/promote.js";
import { hotfix } from "./commands/hotfix.js";
import { stagingFix } from "./commands/staging-fix.js";
import { snapshot } from "./commands/snapshot.js";
import { ideas } from "./commands/ideas.js";
import { features } from "./commands/features.js";
import { projects } from "./commands/projects.js";
import { getVersion } from "./lib/version.js";

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "--version":
  case "-v":
    console.log(getVersion());
    break;

  case "login":
    await login(args);
    break;

  case "logout":
    logout();
    break;

  case "setup":
    await setup();
    break;

  case "start":
    await start();
    break;

  case "stop":
    await stop();
    break;

  case "chat":
    await chat();
    break;

  case "status":
    await status();
    break;

  case "personality":
    await personality(args);
    break;

  case "skills":
    await skills(args);
    break;

  case "promote":
    await promote(args);
    break;

  case "hotfix":
    await hotfix(args);
    break;

  case "staging-fix":
    await stagingFix();
    break;

  case "snapshot":
    await snapshot();
    break;

  case "ideas":
    await ideas(args);
    break;

  case "features":
    await features(args);
    break;

  case "projects":
    await projects(args);
    break;

  case undefined:
  case "--help":
  case "-h":
  case "help":
    console.log("Usage: zazig <command>");
    console.log("");
    console.log("Commands:");
    console.log("  login              Log in to zazig (link or code)");
    console.log("  login --otp        Force one-time code flow (no localhost callback)");
    console.log("  logout             Log out and remove stored credentials");
    console.log("  setup              Create a company, onboard a project, invite teammates");
    console.log("  start              Start the local agent daemon in the background");
    console.log("  stop               Stop the running daemon");
    console.log("  chat               Reconnect TUI to a running daemon");
    console.log("  status             Show agent state and active jobs");
    console.log("  personality <role> Show or switch exec personality (--show, --archetype)");
    console.log("  skills <subcmd>    Inspect/sync workspace skill links (status, sync)");
    console.log("  promote            Push staging to production (migrations, edge fns, pinned build)");
    console.log("  promote --rollback Rollback to previous pinned build");
    console.log("  hotfix \"desc\"      Quick fix: interactive session, commits to master");
    console.log("  staging-fix        Interactive session for fixing staging issues");
    console.log("  snapshot           Print pipeline snapshot JSON to stdout");
    console.log("  ideas              Query ideas (supports filter flags)");
    console.log("  features           Query features (project/status/id filters)");
    console.log("  projects           List projects (optional --include-features)");
    break;

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error("Run 'zazig --help' to see available commands.");
    process.exitCode = 1;
}
