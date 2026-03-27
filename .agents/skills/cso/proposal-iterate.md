# Proposal Iterate

Handle feedback rounds on a live proposal.

## Prerequisites

- Proposal ID — check `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`
- If no ID, ask for it or check the DB: `SELECT id, title, status FROM proposals WHERE company_id = '00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC;`

## Process

### 1. Fetch Current State

Always fetch the live content before making changes — never assume what's in the DB:

```python
# GET /rest/v1/proposals?id=eq.{PROPOSAL_ID}&select=content,pricing,status
```

### 2. Parse Feedback

Feedback comes in different forms:
- **Specific text changes** ("update Tom's bio to say X") → content update
- **Structural changes** ("move this from Phase 2 to Phase 3") → content update
- **Pricing adjustments** ("Chris comes down to $750") → content + pricing jsonb update
- **Visual/rendering issues** ("the paragraph break is missing") → could be content (markdown) or component (code)

### 3. Determine Change Type

| Change | Where | Deploy needed? |
|--------|-------|---------------|
| Section text | DB `content` jsonb | No — instant |
| Pricing figures | DB `content` + `pricing` jsonb | No — instant |
| Allowed emails | DB `allowed_emails` | No — instant |
| Proposal status | DB `status` | No — instant |
| Markdown rendering bug | `Proposal.tsx` renderMarkdown | Yes — code change + push |
| Layout/styling issue | `global.css` | Yes — code change + push |
| New brand assets | `public/brand/` + vercel.json | Yes — code change + push |

### 4. Apply Changes

**For DB changes:** Use Python + Supabase REST API:
1. Fetch current content/pricing
2. Modify in Python
3. PATCH back with `Prefer: return=minimal`

**For code changes:**
1. Modify the file
2. Verify build: `cd packages/webui && npm run build`
3. Commit and push to master
4. Wait ~30s for Vercel deploy

### 5. Verify

After changes:
- If DB-only: tell user to hard-refresh (Cmd+Shift+R)
- If code change: wait for Vercel deploy, then verify via Playwright screenshot or ask user to check
- If user reports issue persists after refresh: check if Vercel CDN is serving stale assets (compare JS hash in page source vs local build)

### 6. Log the Change

Append to `sales/{CLIENT_NAME}/docs/proposal-plans/changelog.md`:

```
## {date} — {summary}
- Changed: {what}
- Reason: {why}
- Type: content | pricing | component
```

### Resetting Status

If the client has already accepted and you need to reset for testing:

```sql
UPDATE proposals SET status = 'draft' WHERE id = '{PROPOSAL_ID}';
```

Use the Management API or REST API with service role key.

## Guardrails

- Always fetch before modifying — never assume DB state
- For code changes, always verify TypeScript compiles before pushing
- Don't force-push to master
- After each round, ask "anything else?" — don't assume done

## Handoff

When iteration is complete: "Looking good. Ready to send? (loads proposal-deliver)"
