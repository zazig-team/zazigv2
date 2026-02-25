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

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "login":
    await login();
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

  case undefined:
  case "--help":
  case "-h":
  case "help":
    console.log("Usage: zazig <command>");
    console.log("");
    console.log("Commands:");
    console.log("  login              Log in to zazig via browser");
    console.log("  logout             Log out and remove stored credentials");
    console.log("  setup              Create a company, onboard a project, invite teammates");
    console.log("  start              Start the local agent daemon in the background");
    console.log("  stop               Stop the running daemon");
    console.log("  chat               Reconnect TUI to a running daemon");
    console.log("  status             Show agent state and active jobs");
    console.log("  personality <role> Show or switch exec personality (--show, --archetype)");
    break;

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error("Run 'zazig --help' to see available commands.");
    process.exitCode = 1;
}
