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
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getValidCredentials } from "../lib/credentials.js";

export async function setup(): Promise<void> {
  // Step 1: Require auth
  let creds;
  try {
    creds = await getValidCredentials();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(creds.supabaseUrl, creds.anonKey);
  await supabase.auth.setSession({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Step 2: Ask what to do
    console.log("\nWhat would you like to do?");
    console.log("  1. Create a new company");
    console.log("  2. Add a project to an existing company");
    const choice = (await rl.question("\nChoice [1/2]: ")).trim();

    let companyId: string;
    let companyName: string;

    if (choice === "2") {
      // Fetch user's companies (RLS-scoped to their JWT company_id)
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

      const { data: company, error } = await supabase
        .from("companies")
        .insert({ name })
        .select("id, name")
        .single();

      if (error || !company) {
        console.error(
          `Failed to create company: ${error?.message ?? "unknown error"}`
        );
        process.exitCode = 1;
        return;
      }

      companyId = company.id;
      companyName = company.name;
      console.log(`\nCompany "${companyName}" created.`);
    }

    // Step 4: Create project
    const projectName = (await rl.question("\nProject name: ")).trim();
    if (!projectName) {
      console.error("Project name is required.");
      process.exitCode = 1;
      return;
    }

    const repoPath =
      (
        await rl.question("Git repo path (or press Enter to skip): ")
      ).trim() || undefined;

    // Read repo context if path given
    let repoContext = "";
    if (repoPath) {
      for (const f of ["README.md", "README.txt", "README"]) {
        const p = join(repoPath, f);
        if (existsSync(p)) {
          try {
            repoContext += `\n--- ${f} ---\n${readFileSync(p, "utf-8").slice(0, 4000)}\n`;
          } catch {
            /* skip unreadable */
          }
          break;
        }
      }
      const pkgPath = join(repoPath, "package.json");
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

          // Write PROJECT.md if repo path given
          if (repoPath && projectBrief) {
            const docsDir = join(repoPath, "docs");
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

    // Insert project
    const { error: projError } = await supabase
      .from("projects")
      .insert({
        company_id: companyId,
        name: projectName,
        repo_url: repoPath,
      })
      .select("id")
      .single();

    if (projError) {
      console.error(
        `Failed to create project: ${projError.message}`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`Project "${projectName}" created.`);

    // Step 5: Invite teammates
    const emailsInput = (
      await rl.question(
        "\nWant to invite teammates? Enter email addresses (comma-separated, or press Enter to skip):\n> "
      )
    ).trim();

    let inviteCount = 0;
    if (emailsInput) {
      const emails = emailsInput
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      for (const email of emails) {
        try {
          // auth.admin requires service role key — will fail with user auth token.
          // TODO: Replace with a Supabase Edge Function if admin invites are needed.
          const { error: inviteError } =
            await supabase.auth.admin.inviteUserByEmail(email, {
              data: { company_id: companyId },
            });

          if (inviteError) {
            console.error(
              `  Failed to invite ${email}: ${inviteError.message}`
            );
          } else {
            inviteCount++;
            console.log(`  Invited ${email}`);
          }
        } catch {
          console.error(
            `  Could not send invites — admin privileges required.\n` +
              `  Ask your Supabase admin to invite users, or use the web UI.`
          );
          break;
        }
      }
    }

    // Step 6: Done
    console.log("\n--- Setup complete! ---");
    console.log(`  Company: ${companyName}`);
    console.log(`  Project: ${projectName}`);
    if (projectBrief) {
      console.log(`  Brief: ${projectBrief.split("\n")[0]?.slice(0, 80)}...`);
    }
    if (inviteCount > 0) {
      console.log(`  ${inviteCount} teammate invite(s) sent`);
    }
    console.log("\nRun 'zazig start' to begin.");
  } finally {
    rl.close();
  }
}
