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
import { jobs } from "./commands/jobs.js";
import { projects } from "./commands/projects.js";
import { standup } from "./commands/standup.js";
import { createFeature } from "./commands/create-feature.js";
import { updateFeature } from "./commands/update-feature.js";
import { createIdea } from "./commands/create-idea.js";
import { updateIdea } from "./commands/update-idea.js";
import { promoteIdea } from "./commands/promote-idea.js";
import { createRule } from "./commands/create-rule.js";
import { createProjectRule } from "./commands/create-project-rule.js";
import { batchCreateJobs } from "./commands/batch-create-jobs.js";
import { sendMessageToHuman } from "./commands/send-message-to-human.js";
import { startExpertSession } from "./commands/start-expert-session.js";
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
    await snapshot(args);
    break;

  case "standup":
    await standup(args);
    break;

  case "ideas":
    await ideas(args);
    break;

  case "features":
    await features(args);
    break;

  case "jobs":
    await jobs(args);
    break;

  case "projects":
    await projects(args);
    break;

  case "create-feature":
    await createFeature(args);
    break;

  case "update-feature":
    await updateFeature(args);
    break;

  case "create-idea":
    await createIdea(args);
    break;

  case "update-idea":
    await updateIdea(args);
    break;

  case "promote-idea":
    await promoteIdea(args);
    break;

  case "create-rule":
    await createRule(args);
    break;

  case "create-project-rule":
    await createProjectRule(args);
    break;

  case "batch-create-jobs":
    await batchCreateJobs(args);
    break;

  case "send-message-to-human":
    await sendMessageToHuman(args);

  case "start-expert-session":
    await startExpertSession(args);
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
    console.log("  snapshot --company <company-id>  Print pipeline snapshot JSON to stdout");
    console.log("  standup --company <company-id>   Print standup summary (or JSON with --json)");
    console.log("  ideas --company <company-id>     Query ideas (supports filter flags)");
    console.log("  features --company <company-id>  Query features (project/status/id filters)");
    console.log("  jobs --company <company-id>      Query jobs (id/feature-id/status filters)");
    console.log("  projects --company <company-id>  List projects (optional --include-features)");
    console.log("  create-feature --company <company-id>  Create a feature");
    console.log("  update-feature --company <company-id>  Update a feature");
    console.log("  create-idea --company <company-id>     Create an idea");
    console.log("  update-idea --company <company-id>     Update an idea");
    console.log("  promote-idea --company <company-id>    Promote an idea");
    console.log("  create-rule --company <company-id>     Create a project rule");
    console.log("  create-project-rule --company <company-id>  Create a project rule");
    console.log("  batch-create-jobs --company <id> --feature-id <id>  Create jobs for a feature");
    console.log("  send-message-to-human --company <id> --text <msg>   Send a message to a human");
    console.log("  start-expert-session --company <company-id>          Start an expert session");
    break;

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error("Run 'zazig --help' to see available commands.");
    process.exitCode = 1;
}
