---
name: slack-headsup
description: |
  Use when you've just created a document, plan, design doc, or artifact and want
  to notify the team. Also use when the user says "headsup", "let Chris know",
  "let Tom know", "post to slack", "notify the team", or "send to exec-team".
---

# Slack Headsup

Post a 1-paragraph summary of a newly created artifact to `#exec-team`, @mentioning the other co-founder.

## Flow

1. **Identify the artifact** — what was just created? (doc path, title, purpose)
2. **Identify the recipient** — who to @mention (the other person, not the sender)
3. **Write the summary** — 1 paragraph, covers: what it is, why it was written, what it covers, where to find it
4. **Post to Slack** — via Doppler-injected CPO bot token

## Recipient Resolution

Determine who's running this session, then @mention the other person:

| Sender machine | Recipient | Slack user ID |
|----------------|-----------|---------------|
| `tomweaver` (`$USER`) | Chris Evans | `U07C0T9J9QD` |
| Chris's machine | Tom Weaver | `U04M914C00L` |

Check `$USER` or `whoami` to determine sender. Default recipient is Chris (most common case — Tom is usually the one sending).

## Summary Format

Write as a personal heads-up from one co-founder to the other. Casual, direct. Structure: one intro line summarising what was done, followed by up to 3 bullets with key details.

Example tone:
> Hey @Chris — heads up, I've written up a design doc for the gate watchdog based on the pipeline freeze we hit yesterday.
> - Covers timeout thresholds, fallback chains, and supervisor authority changes
> - Includes a phased rollout (watchdog first, then degraded-mode dispatch)
> - It's at `docs/plans/2026-02-18-gate-watchdog-design.md` in the zazig repo

## Posting

Use Doppler to inject the CPO bot token, post via Slack API:

```bash
doppler run --project zazig --config prd -- bash -c '
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $CPO_SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"C0AGDQ9GBLY\",
    \"text\": \"Hey <@RECIPIENT_USER_ID> — YOUR_SUMMARY_HERE\",
    \"unfurl_links\": false
  }"'
```

- Channel `C0AGDQ9GBLY` = `#exec-team`
- Always use `unfurl_links: false` to keep the message clean
- Escape single quotes in the summary with `'\''`
- Verify the response contains `"ok":true`

## Overrides

- User can specify a different channel or recipient
- User can provide the summary text directly instead of auto-generating
- If the artifact wasn't created in this session, ask what to summarize
