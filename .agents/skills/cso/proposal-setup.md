# Proposal Setup

Turn a draft and pricing into a live proposal page on zazig.com.

## Prerequisites

- Draft at `sales/{CLIENT_NAME}/docs/proposal-plans/draft-v*.md`
- Pricing at `sales/{CLIENT_NAME}/docs/proposal-plans/pricing.json`
- If either is missing, route to the appropriate skill.

## Process

### 1. Check Prior Proposals

Query the database for existing proposals to use as structural templates:

```sql
SELECT id, title, content FROM proposals ORDER BY created_at DESC LIMIT 3;
```

Use the section structure (keys, ordering) from the most recent proposal as a starting point.

### 2. Prepare Content JSONB

Convert the markdown draft into the `content` jsonb structure:

```json
{
  "sections": [
    { "key": "executive_summary", "title": "Executive Summary", "body_md": "...", "order": 1 },
    { "key": "the_opportunity", "title": "The Opportunity", "body_md": "...", "order": 2 }
  ]
}
```

Rules for `key`: lowercase, underscores, derived from the section title. Must be unique.

### 3. Collect Client Details

Ask for (or find in client-brief.md):
- **Client name** (display name, e.g. "Live Beyond")
- **Client logo** — if available in `docs/brand/`, copy to `packages/webui/public/brand/{client-slug}-logo.png`. If not available, leave null.
- **Client brand colour** — hex code if known, otherwise null
- **Allowed emails** — at minimum the primary contact. Ask: "Who should be able to view this proposal?"
- **Valid until** — ask: "How long should this be valid?" Default: 90 days from today.
- **Prepared by** — default: "Tom Weaver"

### 4. Handle Brand Assets

If copying brand files to `packages/webui/public/brand/`:
1. Copy the file
2. Check `packages/webui/vercel.json` — ensure the rewrite excludes `/brand/`
3. If the rewrite pattern needs updating, modify it
4. Commit the brand assets

### 5. Create the Proposal

Use Python + Supabase REST API to insert:

```python
import urllib.request, json

url = "https://jmussmwglgbwncgygzbz.supabase.co"
key = "SERVICE_ROLE_KEY from doppler"

body = {
    "company_id": "00000000-0000-0000-0000-000000000001",
    "title": "Zazig × {Client Name} — ...",
    "status": "draft",
    "content": { ... },
    "client_name": "...",
    "client_logo_url": "/brand/...",
    "client_brand_color": "#...",
    "prepared_by": "Tom Weaver",
    "allowed_emails": ["..."],
    "pricing": { ... },
    "valid_until": "..."
}

# POST to /rest/v1/proposals
```

### 6. Record the Proposal ID

Save the returned UUID to `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`.

### 7. Report

Print:
- Proposal URL: `zazig.com/proposals/{id}`
- Status: `draft` (not visible to client until sent)
- Allowed viewers: list emails
- Valid until: date

## Guardrails

- Status MUST be `draft` — never auto-send
- Confirm the URL loads before reporting success (use Playwright if available)
- Never auto-send — delivery is a separate skill with its own approval gate
- Get the service role key from Doppler: `doppler secrets get SUPABASE_SERVICE_ROLE_KEY --project zazig --config prd --plain`

## Handoff

"Proposal is live in draft at {URL}. Want to review it before sending? (loads proposal-iterate) Or ready to send? (loads proposal-deliver)"
