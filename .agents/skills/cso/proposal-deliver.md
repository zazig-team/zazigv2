# Proposal Deliver

Send the proposal to the client and track engagement.

## Prerequisites

- Proposal must exist and be in `draft` status
- Get proposal ID from `sales/{CLIENT_NAME}/docs/proposal-plans/proposal-id.txt`

## Process

### 1. Pre-Flight Checks

Verify before sending:

- [ ] All sections have content (no empty `body_md`)
- [ ] Pricing is populated with at least one phase
- [ ] `allowed_emails` has at least one client email
- [ ] `valid_until` is set and in the future
- [ ] Brand assets load (if `client_logo_url` is set, verify the image serves correctly)
- [ ] The proposal URL loads without errors

Run checks by fetching the proposal and validating each field. If any fail, report what's missing and suggest fixes.

### 2. Get Approval

**Never send without explicit approval from Tom.**

Present a summary:
```
Ready to send:
  Title: {title}
  Client: {client_name}
  URL: zazig.com/proposals/{id}
  Viewers: {allowed_emails}
  Valid until: {valid_until}
  Total value: {total}

Confirm? (y/n)
```

### 3. Change Status

```python
# PATCH /rest/v1/proposals?id=eq.{PROPOSAL_ID}
# Body: {"status": "sent"}
```

### 4. Compose Notification

Draft a message Tom can send to the client. Tone should match the CSO's active archetype.

**Template (Relationship Builder):**

```
Subject: Zazig × {Client Name} — Proposal Ready

Hi {Contact First Name},

Great speaking with you. As discussed, I've put together a proposal
for how Zazig can help build {project description}.

You can view it here: https://zazig.com/proposals/{id}

Sign in with your Google account ({client_email}) to access it.
Happy to walk through any section in detail — just let me know
a good time.

Best,
Tom
```

When Resend is integrated, this will send automatically. For now, present the draft for Tom to copy-paste.

### 5. Log Delivery

Append to `sales/{CLIENT_NAME}/docs/proposal-plans/changelog.md`:

```
## {date} — Proposal sent
- Status: draft → sent
- Viewers: {emails}
- URL: zazig.com/proposals/{id}
```

## Post-Delivery Monitoring

The `proposal_views` table tracks engagement automatically:
- When the client views the proposal, `viewed_at` is set and status changes to `viewed`
- Each view is logged in `proposal_views` with email and timestamp

**Check engagement:**
```sql
SELECT viewer_email, viewed_at, COUNT(*) as views
FROM proposal_views
WHERE proposal_id = '{PROPOSAL_ID}'
GROUP BY viewer_email, viewed_at;
```

**If no view after 48 hours:** Draft a follow-up nudge for Tom to send.

**If client clicks "Start Pilot Sprint":** Status changes to `accepted`. The events table logs `proposal_access_requested` — monitor for this.

## Guardrails

- Never send without Tom's explicit approval
- Include the proposal URL in notifications, never the raw content
- Flag if `valid_until` is less than 7 days away
- Never auto-follow-up — draft nudges for Tom to review and send manually
