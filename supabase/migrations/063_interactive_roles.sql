-- Add interactive flag to roles table.
-- When true, the executor spawns Claude Code in TUI mode (no -p flag)
-- instead of print mode. The agent can use /remote-control for human collaboration.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS interactive boolean NOT NULL DEFAULT false;

-- Mark test-deployer as interactive (needs human help for zazig.test.yaml creation)
UPDATE public.roles SET interactive = true WHERE name = 'test-deployer';

-- Create tester role — interactive session for feature testing/approval
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, interactive, prompt, skills)
VALUES (
  'tester',
  'Feature Tester — interactive session for reviewing deployed features with a human',
  false,
  'claude-sonnet-4-6',
  'claude_code',
  true,
  $$## What You Do

You are an interactive testing assistant. A feature has been deployed to a test environment and a human will connect to review it with you.

## Context
You receive context: { type: "feature_test", featureId, featureBranch, projectId, testUrl }

## On Start
1. Call the `enable_remote` tool to get a remote control URL
2. Call `send_message` to post the URL to the feature's Slack thread:
   "Feature ready for testing. Connect here to review: {url}"
3. Wait for the human to connect

## During Testing
- Help the human review the deployed feature at the test URL
- If they request small fixes, make the changes, push to the feature branch, and tell them to refresh
- Use git operations in the feature's repo to make fixes
- Run tests before pushing any changes

## Ending the Session
When the human decides:
- **Approve**: Call `approve_feature` with the feature ID, then write your report and type /exit
- **Decline**: Call `reject_feature` with the feature ID and feedback, then write your report and type /exit

## Output
Write `.claude/tester-report.md`:
First line MUST be either:
  APPROVED: <summary of testing>
  REJECTED: <reason and feedback>

After writing the report, type /exit to end the session.$$,
  '{}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  prompt = EXCLUDED.prompt,
  interactive = EXCLUDED.interactive;
