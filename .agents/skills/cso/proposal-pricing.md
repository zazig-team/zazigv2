# Proposal Pricing

Structure the commercial terms for a proposal. Separate from drafting because pricing needs its own focused conversation.

## Prerequisites

- A draft must exist at `sales/{CLIENT_NAME}/docs/proposal-plans/draft-v*.md`. If not, say: "No draft found. Let me write one first." and load `proposal-draft.md`.

## Process

### 1. Read the Draft

Understand the phases, deliverables, and timeline. Count months per phase using dates from the client brief.

### 2. Standard Rate Card

**Internal only — never share with clients.**

| Role | Phase 1 (fully managed) | Phase 2+ (partially managed) |
|------|------------------------|------------------------------|
| Tom Weaver (CPO) | $1,500/mo | $750/mo |
| Chris Evans (CTO) | $1,500/mo | $750/mo |
| Autonomous Execs & Workers | $1,000/mo | $500/mo |
| Infrastructure (compute, subs) | $1,000/mo | $1,500/mo |
| **Total** | **$5,000/mo** | **$3,500/mo** |

These are defaults. Adjust per deal based on:
- Scope complexity (more infra-heavy = shift budget to infra)
- Tom/Chris involvement level (advisory-only = lower)
- Strategic value of the client (first client in a vertical = may discount)

### 3. Propose Breakdown

Present per-role table for each phase, with:
- Monthly cost per role
- Phase duration in months
- Phase total
- Overall total (all phases combined)

### 4. Commercial Structure

Ask about each:

**Payment:** Default is loan note. Options:
- (a) Loan note — repaid after seed round or any funding >$300K
- (b) Monthly cash payment
- (c) Hybrid — reduced monthly + smaller loan note

**Off-ramps:** Default is exit at each phase boundary. All code and IP transferable at any point.

**Investment dependency:** If loan note: what happens if client doesn't raise? Default: engagement pauses, interest accrues on outstanding balance.

**Infrastructure at scale:** Always borne by client. We cover infra during build phases only.

### 5. Produce Pricing Data

Create structured pricing file at `sales/{CLIENT_NAME}/docs/proposal-plans/pricing.json`:

```json
{
  "phases": [
    {
      "name": "Phase 1 — ...",
      "monthly": 5000,
      "duration_months": 2.5,
      "deliverables": ["...", "..."]
    }
  ],
  "total_year1": 26500,
  "loan_note_terms": "..."
}
```

Also append the pricing section to the latest draft.

## Guardrails

- Never share the rate card with clients
- Always anchor against the alternative cost ("the agency quoted $X")
- Flag if total is below $20K (may not be worth the engagement)
- Infrastructure at launch scale always borne by client
- Never commit to pricing without Tom's approval

## Handoff

When pricing is approved: "Pricing locked. Ready to create the live proposal page? (loads proposal-setup)"
