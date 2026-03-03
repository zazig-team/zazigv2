/**
 * setup.ts — zazig setup
 *
 * Guided flow: create company → create project (with optional AI conversation
 * to generate a project brief) → invite teammates.
 *
 * Requires prior `zazig login` (PR #59 — cpo/cli-supabase-auth).
 */

import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SLACK_CLIENT_ID } from "../lib/constants.js";

export async function setup(): Promise<void> {
  // Step 0: Check prerequisites
  let ghInstalled = false;
  try {
    execSync("gh --version", { stdio: "pipe" });
    ghInstalled = true;
  } catch { /* not installed */ }

  if (!ghInstalled) {
    console.log("\nGitHub CLI (gh) is not installed.");
    console.log("zazig uses gh to create and manage GitHub repositories during setup.\n");
    console.log("Install it:");
    console.log("  macOS:   brew install gh");
    console.log("  Linux:   https://github.com/cli/cli/blob/trunk/docs/install_linux.md");
    console.log("  Windows: winget install --id GitHub.cli\n");
    console.log("Then authenticate:  gh auth login\n");
    process.exitCode = 1;
    return;
  }

  let ghAuthed = false;
  try {
    execSync("gh auth status", { stdio: "pipe" });
    ghAuthed = true;
  } catch { /* not authenticated */ }

  if (!ghAuthed) {
    console.log("\nGitHub CLI is installed but not authenticated.");
    console.log("Run:  gh auth login\n");
    process.exitCode = 1;
    return;
  }

  // Step 1: Require auth
  let creds;
  try {
    creds = await getValidCredentials();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const supabase = createClient(creds.supabaseUrl, anonKey);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  if (sessionError) {
    console.error(`Authentication failed: ${sessionError.message}`);
    console.error("Try running 'zazig login' again.");
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Check for pending invites
    const { data: pendingInvites } = await supabase.rpc("get_my_pending_invites");
    if (pendingInvites && pendingInvites.length > 0) {
      console.log("\nYou have pending invites:");
      for (const inv of pendingInvites as Array<{ invite_id: string; company_name: string }>) {
        const answer = (
          await rl.question(`  Join "${inv.company_name}"? [y/n]: `)
        ).trim().toLowerCase();
        if (answer === "y" || answer === "yes") {
          const { error } = await supabase.rpc("accept_invite", { p_invite_id: inv.invite_id });
          if (error) {
            console.error(`    Failed: ${error.message}`);
          } else {
            console.log(`    Joined ${inv.company_name}`);
          }
        } else {
          await supabase.rpc("decline_invite", { p_invite_id: inv.invite_id });
          console.log(`    Declined.`);
        }
      }
    }

    // Step 2: Ask what to do
    console.log("\nWhat would you like to do?");
    console.log("  1. Create a new company");
    console.log("  2. Add a project to an existing company");
    const choice = (await rl.question("\nChoice [1/2]: ")).trim();

    let companyId: string;
    let companyName: string;

    if (choice === "2") {
      // Fetch user's companies (RLS-scoped via user_companies join table)
      const { data: companies, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");

      if (error || !companies || companies.length === 0) {
        console.error(
          "No companies found. Create one first (option 1)."
        );
        process.exitCode = 1;
        return;
      }

      if (companies.length === 1) {
        companyId = companies[0]!.id;
        companyName = companies[0]!.name;
        console.log(`\nCompany: ${companyName}`);
      } else {
        console.log("\nYour companies:");
        for (let i = 0; i < companies.length; i++) {
          console.log(`  [${i + 1}] ${companies[i]!.name}`);
        }
        const idx =
          parseInt(
            (
              await rl.question(
                `Select company [1-${companies.length}]: `
              )
            ).trim(),
            10
          ) - 1;
        if (idx < 0 || idx >= companies.length) {
          console.error("Invalid selection.");
          process.exitCode = 1;
          return;
        }
        companyId = companies[idx]!.id;
        companyName = companies[idx]!.name;
      }
    } else {
      // Step 3: Create company
      const name = (await rl.question("\nCompany name: ")).trim();
      if (!name) {
        console.error("Company name is required.");
        process.exitCode = 1;
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Could not resolve authenticated user. Try 'zazig login' again.");
        process.exitCode = 1;
        return;
      }

      // Generate UUID client-side to avoid needing a RETURNING clause.
      // PostgREST's RETURNING requires the SELECT policy to pass, but the
      // user_companies link doesn't exist yet at insert time.
      const newCompanyId = randomUUID();

      const { error } = await supabase
        .from("companies")
        .insert({ id: newCompanyId, name, created_by: user.id });

      if (error) {
        console.error(`Failed to create company: ${error.message}`);
        process.exitCode = 1;
        return;
      }

      // Link the authenticated user to the new company
      const { error: memberErr } = await supabase
        .from("user_companies")
        .insert({ user_id: user.id, company_id: newCompanyId });
      if (memberErr) {
        console.error(`Warning: could not link you to company: ${memberErr.message}`);
      }

      companyId = newCompanyId;
      companyName = name;
      console.log(`\nCompany "${companyName}" created.`);
    }

    // Step 4: Create project
    const projectName = (await rl.question("\nProject name: ")).trim();
    if (!projectName) {
      console.error("Project name is required.");
      process.exitCode = 1;
      return;
    }

    // Git repo — create new or link existing
    let repoUrl: string | undefined;
    console.log("\nGit repository:");
    console.log("  1. Create a new GitHub repo");
    console.log("  2. Use an existing repo URL");
    console.log("  3. Skip");
    const repoChoice = (await rl.question("\nChoice [1/2/3]: ")).trim();

    if (repoChoice === "1") {
      const defaultName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const repoName = (
        await rl.question(`Repo name [${defaultName}]: `)
      ).trim() || defaultName;

      // Detect GitHub orgs the user belongs to
      let orgList: string[] = [];
      try {
        const orgsJson = execSync("gh api user/orgs --jq '.[].login'", { encoding: "utf-8" }).trim();
        if (orgsJson) orgList = orgsJson.split("\n").filter(Boolean);
      } catch { /* no orgs or gh issue — fall through to personal */ }

      let owner = "";
      if (orgList.length > 0) {
        console.log("\nCreate under:");
        console.log("  1. Personal account");
        for (let i = 0; i < orgList.length; i++) {
          console.log(`  ${i + 2}. ${orgList[i]}`);
        }
        const ownerIdx = parseInt(
          (await rl.question(`Choice [1-${orgList.length + 1}]: `)).trim(), 10
        );
        if (ownerIdx >= 2 && ownerIdx <= orgList.length + 1) {
          owner = orgList[ownerIdx - 2]! + "/";
        }
      }

      try {
        const result = execSync(
          `gh repo create ${owner}${repoName} --private --clone=false`,
          { encoding: "utf-8" }
        ).trim();
        // gh repo create prints the URL
        repoUrl = result.match(/https:\/\/github\.com\/\S+/)?.[0] ?? result;
        console.log(`Repository created: ${repoUrl}`);
      } catch (err) {
        console.error(`Failed to create repo: ${String(err)}`);
        console.error("Continuing without a repo URL.");
      }
    } else if (repoChoice === "2") {
      // Pick an account/org first, then show repos under it
      let ghUser = "";
      try {
        ghUser = execSync("gh api user --jq '.login'", { encoding: "utf-8" }).trim();
      } catch { /* ignore */ }

      let orgList: string[] = [];
      try {
        const orgsRaw = execSync("gh api user/orgs --jq '.[].login'", { encoding: "utf-8" }).trim();
        if (orgsRaw) orgList = orgsRaw.split("\n").filter(Boolean);
      } catch { /* ignore */ }

      let selectedOwner = ghUser;
      if (orgList.length > 0) {
        console.log("\nShow repos for:");
        if (ghUser) console.log(`  1. ${ghUser} (personal)`);
        for (let i = 0; i < orgList.length; i++) {
          console.log(`  ${(ghUser ? 2 : 1) + i}. ${orgList[i]}`);
        }
        const manualIdx = (ghUser ? 2 : 1) + orgList.length;
        console.log(`  ${manualIdx}. Enter URL manually`);
        const ownerIdx = parseInt(
          (await rl.question(`\nChoice [1-${manualIdx}]: `)).trim(), 10
        );
        if (ghUser && ownerIdx === 1) {
          selectedOwner = ghUser;
        } else if (ownerIdx === manualIdx) {
          // Manual entry
          const urlInput = (await rl.question("Git remote URL: ")).trim();
          if (urlInput) repoUrl = urlInput;
          selectedOwner = ""; // skip repo listing
        } else {
          const orgIdx = ownerIdx - (ghUser ? 2 : 1);
          if (orgIdx >= 0 && orgIdx < orgList.length) {
            selectedOwner = orgList[orgIdx]!;
          }
        }
      }

      if (selectedOwner && !repoUrl) {
        let repos: Array<{ name: string; url: string }> = [];
        try {
          const raw = execSync(
            `gh repo list ${selectedOwner} --limit 30 --json name,url --jq '.[] | "\\(.name)\\t\\(.url)"'`,
            { encoding: "utf-8" }
          ).trim();
          if (raw) {
            repos = raw.split("\n").map((line) => {
              const [name, url] = line.split("\t");
              return { name: name!, url: url! };
            });
          }
        } catch { /* fall through to manual */ }

        if (repos.length > 0) {
          console.log(`\nRepos in ${selectedOwner}:`);
          for (let i = 0; i < repos.length; i++) {
            console.log(`  [${i + 1}] ${repos[i]!.name}`);
          }
          console.log(`  [${repos.length + 1}] Enter URL manually`);
          const repoIdx = parseInt(
            (await rl.question(`\nChoice [1-${repos.length + 1}]: `)).trim(), 10
          );
          if (repoIdx >= 1 && repoIdx <= repos.length) {
            repoUrl = repos[repoIdx - 1]!.url;
            console.log(`Selected: ${repoUrl}`);
          } else if (repoIdx === repos.length + 1) {
            const urlInput = (await rl.question("Git remote URL: ")).trim();
            if (urlInput) repoUrl = urlInput;
          }
        } else {
          console.log(`\nNo repos found under ${selectedOwner}.`);
          const urlInput = (
            await rl.question("Git remote URL (or press Enter to skip): ")
          ).trim();
          if (urlInput) repoUrl = urlInput;
        }
      }
    }

    // Local repo path — used only for reading context files, NOT stored in DB
    // Default to <cwd>/<repo-name> if we can infer a repo name
    let defaultLocalPath: string | undefined;
    if (repoUrl) {
      const repoName = repoUrl.replace(/\.git$/, "").split("/").pop();
      if (repoName) {
        defaultLocalPath = join(process.cwd(), repoName);
      }
    }
    const localPathPrompt = defaultLocalPath
      ? `Local repo path [${defaultLocalPath}]: `
      : "Local repo path for context reading (or press Enter to skip): ";
    const localRepoPath =
      (await rl.question(localPathPrompt)).trim() || defaultLocalPath;

    // Read repo context if local path given
    let repoContext = "";
    if (localRepoPath) {
      for (const f of ["README.md", "README.txt", "README"]) {
        const p = join(localRepoPath, f);
        if (existsSync(p)) {
          try {
            repoContext += `\n--- ${f} ---\n${readFileSync(p, "utf-8").slice(0, 4000)}\n`;
          } catch {
            /* skip unreadable */
          }
          break;
        }
      }
      const pkgPath = join(localRepoPath, "package.json");
      if (existsSync(pkgPath)) {
        try {
          repoContext += `\n--- package.json ---\n${readFileSync(pkgPath, "utf-8").slice(0, 2000)}\n`;
        } catch {
          /* skip */
        }
      }
    }

    // AI conversation about the project
    let projectBrief: string | undefined;
    const anthropicKey = process.env["ANTHROPIC_API_KEY"];

    if (anthropicKey) {
      console.log(
        "\nTell me about this project — what does it do, what are you building?"
      );
      const userDescription = (await rl.question("> ")).trim();

      if (userDescription) {
        process.stdout.write("\nGenerating project brief...");
        try {
          const systemPrompt =
            "You are a helpful assistant that creates concise project briefs. " +
            "Given a user's description and optional repo context, write a structured " +
            "project brief in Markdown with sections: Overview, Tech Stack, Goals. " +
            "Keep it under 500 words.";

          const userContent = repoContext
            ? `User description: ${userDescription}\n\nRepo context:\n${repoContext}`
            : `User description: ${userDescription}`;

          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 1024,
              system: systemPrompt,
              messages: [{ role: "user", content: userContent }],
            }),
          });

          if (!resp.ok) {
            throw new Error(`API returned ${resp.status}`);
          }

          const result = (await resp.json()) as {
            content: Array<{ type: string; text: string }>;
          };
          projectBrief =
            result.content.find((b) => b.type === "text")?.text ??
            userDescription;
          console.log(" done");

          // Write PROJECT.md if local repo path given
          if (localRepoPath && projectBrief) {
            const docsDir = join(localRepoPath, "docs");
            mkdirSync(docsDir, { recursive: true });
            const projectMdPath = join(docsDir, "PROJECT.md");
            writeFileSync(
              projectMdPath,
              `# ${projectName}\n\n${projectBrief}\n`,
              "utf-8"
            );
            console.log(`Project brief written to ${projectMdPath}`);
          }
        } catch (err) {
          console.log(" failed");
          console.error(
            `AI brief generation failed: ${String(err)}. Using your description instead.`
          );
          projectBrief = userDescription;
        }
      }
    } else {
      projectBrief = (
        await rl.question("\nBrief description of the project: ")
      ).trim();
    }

    // Insert project (same pattern: client-side UUID to avoid RETURNING + SELECT policy conflict)
    const newProjectId = randomUUID();
    const { error: projError } = await supabase
      .from("projects")
      .insert({
        id: newProjectId,
        company_id: companyId,
        name: projectName,
        repo_url: repoUrl,
      });

    if (projError) {
      console.error(
        `Failed to create project: ${projError.message}`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`Project "${projectName}" created (id: ${newProjectId}).`);

    // Step 4: Connect Slack workspace
    const supabaseUrl = creds.supabaseUrl;
    let slackWorkspaceName: string | undefined;

    console.log("\nNext, connect Slack so you can chat with your AI agents.");
    await rl.question("Press Enter to open Slack authorization...");

    const slackClientId = process.env["SLACK_CLIENT_ID"] ?? DEFAULT_SLACK_CLIENT_ID;
    const scopes = "app_mentions:read,channels:history,channels:manage,chat:write,im:history";
    const redirectUri = `${supabaseUrl}/functions/v1/slack-oauth`;
    const oauthUrl =
      `https://slack.com/oauth/v2/authorize?client_id=${slackClientId}` +
      `&scope=${scopes}&state=${companyId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
    try {
      execSync(`${openCmd} "${oauthUrl}"`, { stdio: "pipe" });
    } catch {
      console.log("Could not open browser. Visit this URL manually:");
      console.log(`  ${oauthUrl}`);
    }

    console.log("Waiting for Slack authorization...");
    const pollStart = Date.now();
    const POLL_TIMEOUT_MS = 180_000; // 3 minutes
    const POLL_INTERVAL_MS = 2_000;

    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      const { data } = await supabase
        .from("slack_installations")
        .select("team_name")
        .eq("company_id", companyId)
        .limit(1)
        .single();

      if (data?.team_name) {
        slackWorkspaceName = data.team_name;
        console.log(`Slack workspace "${slackWorkspaceName}" connected!`);
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!slackWorkspaceName) {
      console.log("Timed out waiting for Slack authorization.");
      console.log("You can connect Slack later by re-running setup.");
    }

    // Create a Slack channel for CPO conversations
    let slackChannelName: string | undefined;
    if (slackWorkspaceName) {
      const defaultChannel = "zazig-cpo";
      const channelInput = (
        await rl.question(`\nSlack channel for CPO conversations [${defaultChannel}]: `)
      ).trim() || defaultChannel;

      process.stdout.write(`Creating #${channelInput}...`);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/slack-create-channel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: companyId, channel_name: channelInput }),
        });
        const result = await res.json() as { ok: boolean; channel_name?: string; error?: string };
        if (result.ok) {
          slackChannelName = result.channel_name;
          console.log(` done! #${slackChannelName} is ready.`);
        } else {
          console.log(` failed: ${result.error}`);
        }
      } catch (err) {
        console.log(` failed: ${String(err)}`);
      }
    }

    // Step 5: Configure CPO
    let cpoArchetype: string | undefined;
    console.log("\nConfigure your CPO:");
    console.log("  1. The Strategist — data-driven, methodical, speaks in frameworks");
    console.log("  2. Founder's Instinct — direct, high-energy, trusts gut with data");
    console.log("  3. The Operator — terse, execution-focused, sprint-cadence rhythm");
    console.log("  4. Skip");
    const archChoice = (await rl.question("\nChoice [1]: ")).trim() || "1";

    const archetypeMap: Record<string, string> = {
      "1": "strategist",
      "2": "founders-instinct",
      "3": "operator",
    };
    const archName = archetypeMap[archChoice];
    const archDisplayNames: Record<string, string> = {
      "strategist": "The Strategist",
      "founders-instinct": "Founder's Instinct",
      "operator": "The Operator",
    };

    if (archName) {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "setup_company_cpo",
        { p_company_id: companyId, p_archetype_name: archName },
      );

      if (rpcErr) {
        console.error(`Failed to configure CPO: ${rpcErr.message}`);
      } else if (rpcResult && !(rpcResult as { ok: boolean }).ok) {
        console.error(`Failed to configure CPO: ${(rpcResult as { error: string }).error}`);
      } else {
        cpoArchetype = archDisplayNames[archName];
        console.log(`CPO configured with "${cpoArchetype}" personality.`);
      }
    }

    // Step 6: Invite teammates
    console.log("\nTeammates:");
    console.log("  1. Invite teammates to the company");
    console.log("  2. Skip for now");
    const inviteChoice = (await rl.question("\nChoice [1/2]: ")).trim();

    const invitedEmails: string[] = [];

    if (inviteChoice === "1") {
    console.log("\nEnter email addresses (empty line to finish):");

    while (true) {
      const email = (await rl.question("  Email: ")).trim();
      if (!email) break;
      if (!email.includes("@")) {
        console.error("    Invalid email, try again.");
        continue;
      }

      // Insert invite record
      const { error: invErr } = await supabase
        .from("invites")
        .insert({ company_id: companyId, email, invited_by: (await supabase.auth.getUser()).data.user!.id });

      if (invErr) {
        if (invErr.message.includes("duplicate")) {
          console.log(`    ${email} already invited.`);
        } else {
          console.error(`    Failed to invite ${email}: ${invErr.message}`);
        }
        continue;
      }

      // Send magic link so they get an account when they click it
      await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({ email }),
      });

      invitedEmails.push(email);
      console.log(`    Invited ${email}`);
    }
    }

    // Step 7: Done
    console.log("\n--- Setup complete! ---");
    console.log(`  Company:  ${companyName}`);
    console.log(`  Project:  ${projectName}`);
    if (projectBrief) {
      console.log(`  Brief:    ${projectBrief.split("\n")[0]?.slice(0, 80)}...`);
    }
    if (slackWorkspaceName) {
      console.log(`  Slack:    ${slackWorkspaceName}${slackChannelName ? ` (#${slackChannelName})` : ""}`);
    }
    if (cpoArchetype) {
      console.log(`  CPO:      ${cpoArchetype}`);
    }
    if (invitedEmails.length > 0) {
      console.log(`  Invited:  ${invitedEmails.join(", ")}`);
    }
    console.log("\nRun 'zazig start' to begin.");
  } finally {
    rl.close();
  }
}
