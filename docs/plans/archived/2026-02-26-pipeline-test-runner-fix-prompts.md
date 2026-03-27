# Two Items Left to Unblock Pipeline E2E

The code fixes (null branch guards, verifier repo path, lifecycle pollers) are all committed. Two items remain before the pipeline can complete a deploy_to_test cycle.

---

## Prompt 1: Fix test-runner repo path resolution

Copy everything between the START/END markers and paste into the other window.

<!-- START PROMPT 1 -->

Fix the test-runner's repo path resolution — same bug the verifier had.

Problem: `packages/local-agent/src/test-runner.ts:81` does `msg.repoPath ?? process.cwd()`. The orchestrator sends a git URL (`https://github.com/zazig-team/zazigv2.git`) as `repoPath`. The test-runner tries to read `zazig.test.yaml` from the URL string as a filesystem path, which fails. You can see this in `~/.zazigv2/local-agent.log`:

    WARN [test-runner] No zazig.test.yaml found at https://github.com/zazig-team/zazigv2.git

Fix: Apply the same `resolveRepoPath()` pattern already used in `packages/local-agent/src/verifier.ts:54-61`.

What to do:

1. Read `packages/local-agent/src/test-runner.ts`

2. Add `import { homedir } from "node:os";` to the imports (line 15-21 area)

3. Add a `resolveRepoPath` helper function after the constants block (after line 30). Copy the exact logic from `packages/local-agent/src/verifier.ts:54-61` — it resolves URLs to `~/.zazigv2/repos/<repoName>`.

4. Change line 81 from `const repoPath = msg.repoPath ?? process.cwd();` to `const repoPath = msg.repoPath ? resolveRepoPath(msg.repoPath) : process.cwd();`

5. Check `runTeardown` at line 150 — it takes a `repoPath` string parameter. Callers pass the already-resolved path from `handleDeployToTest`, so it should be fine. But verify no other callers pass a raw URL.

6. Commit with message: "fix: resolve repo path from URL in test-runner (same pattern as verifier)"

Rules:
- Do NOT refactor resolveRepoPath into a shared module. Duplicate it. We'll DRY it up later.
- Do NOT touch verifier.ts or any other file.
- Do NOT modify the readTestRecipe function or anything else in test-runner.ts.

<!-- END PROMPT 1 -->

---

## Prompt 2: Create zazig.test.yaml

The `zazig.test.yaml` tells the test-runner HOW to deploy a feature branch. Since zazigv2 is the platform itself (not a deployable web app), you need to decide what "deploy to test" means.

**Option A — No-op (fastest to unblock).** Good for smoke-testing the pipeline flow itself. Copy everything between the START/END markers:

<!-- START PROMPT 2A -->

Create a minimal `zazig.test.yaml` at the repo root for smoke-testing the pipeline. We don't have a real deploy target yet, so use a no-op custom script.

Create file `zazig.test.yaml` at the repo root with this exact content:

    # Minimal test recipe for pipeline smoke testing.
    # Replace with real deploy config when we have a test environment.
    name: zazigv2
    type: persistent
    deploy:
      provider: custom
      script: "echo 'no-op deploy for pipeline smoke test' && echo 'http://localhost:3000'"
      url_output: stdout

No healthcheck — we're just validating the pipeline flow.

Commit with message: "chore: add minimal zazig.test.yaml for pipeline smoke testing"

<!-- END PROMPT 2A -->

**Option B — Real deploy config.** If you have a Vercel project or deploy script for a test environment, wire that in instead. Bigger conversation.

---

## After Both Prompts

1. Rebuild the local agent: `cd ~/Documents/GitHub/zazigv2 && npm run build -w packages/local-agent`
2. Restart the daemon (it picks up the rebuilt agent on restart)
3. Deploy the orchestrator edge function if not already done: `cd ~/Documents/GitHub/zazigv2 && supabase functions deploy orchestrator`
4. Watch the logs: `tail -f ~/.zazigv2/local-agent.log`

The next `deploy_to_test` poll (~6 minutes) should resolve `zazig.test.yaml` correctly and either run the deploy or succeed with the no-op.

---

## Remaining Known Issues (Post-Unblock)

1. **Silent verification bypass** — features progress past `verifying` even when verification fails.
2. **Shared repo clone contention** — verifier and test-runner both use `~/.zazigv2/repos/` without locking. Safe at current scale.
3. **Missing skill files** — daemon warns about missing `projects/skills/{cto,brainstorming,ideaify,drive-pipeline,multi-agent-review}.md`. Non-blocking.
