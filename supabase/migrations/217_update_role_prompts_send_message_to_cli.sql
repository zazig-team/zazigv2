-- Migration 217: update test-deployer, tester, and monitoring-agent prompts
-- to reference "zazig send-message-to-human" CLI command instead of the
-- removed send_message MCP tool.

UPDATE public.roles
SET prompt = prompt || E'\n\n---\n\n## Sending Messages to Humans\n\nTo notify the human (e.g. build results, failures, status updates), use the CLI command:\n\n  zazig send-message-to-human --company <company-id> --text "<your message>"\n\nOptional flags:\n  --conversation-id <id>   Thread the reply into a specific Slack conversation\n  --job-id <uuid>          Attach the message to a specific job\n\nDo NOT use the send_message MCP tool — it has been removed.'
WHERE name = 'test-deployer';

UPDATE public.roles
SET prompt = prompt || E'\n\n---\n\n## Sending Messages to Humans\n\nTo notify the human (e.g. test results, failures, status updates), use the CLI command:\n\n  zazig send-message-to-human --company <company-id> --text "<your message>"\n\nOptional flags:\n  --conversation-id <id>   Thread the reply into a specific Slack conversation\n  --job-id <uuid>          Attach the message to a specific job\n\nDo NOT use the send_message MCP tool — it has been removed.'
WHERE name = 'tester';

UPDATE public.roles
SET prompt = prompt || E'\n\n---\n\n## Sending Messages to Humans\n\nTo alert the human (e.g. anomalies, incidents, health status), use the CLI command:\n\n  zazig send-message-to-human --company <company-id> --text "<your message>"\n\nOptional flags:\n  --conversation-id <id>   Thread the reply into a specific Slack conversation\n  --job-id <uuid>          Attach the message to a specific job\n\nDo NOT use the send_message MCP tool — it has been removed.'
WHERE name = 'monitoring-agent';
