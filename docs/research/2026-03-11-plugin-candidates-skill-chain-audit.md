# Plugin Candidates: Skill Chain Audit

**Date:** 2026-03-11
**Context:** Inspired by [@NickSpisak_ thread](docs/research/x-research/2026-03-09-skill-systems-over-standalone-skills.md) on skill systems vs standalone skills. Auditing three chains where humans are currently "the glue" between steps.

---

## 1. Idea Processing Pipeline: `triage → enrich → promote`

### Current Flow

| Step | Skill | Trigger | Who's the Glue |
|------|-------|---------|----------------|
| **Triage** | `/triage` | Manual: CPO during standup, WebUI "Triage" button, or auto-triage orchestrator hook | Orchestrator (auto) or Human (manual) |
| **Enrich** | `/triage` (enrich mode) | Manual: WebUI "Enrich" button (just shipped) | **Human clicks button** |
| **Promote** | `promote-idea` edge function | Manual: WebUI "Promote to Feature" button, or CPO with human approval | **Human clicks button** |

### Step Detail

**Triage**
- Input: `query_ideas(status='new')` or single idea ID from job context
- Output: `update_idea()` → sets priority, tags, triage_notes, suggested_exec, `status='triaged'`
- Orchestration: Auto-triage dispatches `triage-analyst` contractor via `request_standalone_work` RPC (not yet in production)

**Enrich** (new, just shipped)
- Input: JSON context `{"idea_id": "uuid", "action": "enrich", "missing": ["title"]}`
- Output: `update_idea()` → fills missing fields only, status stays `triaged`
- Orchestration: Manual — human sees failed readiness checks, clicks Enrich

**Promote**
- Input: Idea ID + promote target (feature/job/research/capability) + project_id
- Output: `promote-idea` edge function creates feature/job, sets `status='promoted'`
- Orchestration: Manual — human reviews triaged idea and clicks Promote

### Where the Human is the Glue
1. After triage completes → human must notice the idea is triaged, review it, decide if fields are complete
2. If incomplete → human clicks Enrich, waits, comes back
3. When complete → human clicks Promote

### Plugin Opportunity
**Triage output → readiness check → auto-enrich → present for human decision.** The only human gate should be the promote/park/reject decision, not the mechanical "are fields filled in" step. The orchestrator could run readiness checks on every newly-triaged idea and auto-commission enrichment if gaps exist.

---

## 2. Feature Planning Pipeline: `plan-capability → spec-feature → jobify`

### Current Flow

| Step | Skill | Trigger | Who's the Glue |
|------|-------|---------|----------------|
| **Plan Capability** | `/plan-capability` | CPO routing — human describes a capability idea | **Human initiates with CPO** |
| **Structure into Features** | `/featurify` (via Project Architect) | CPO commissions Project Architect contractor | **CPO commissions manually** |
| **Spec Each Feature** | `/spec-feature` | CPO picks up each created feature and specs it | **CPO manually iterates per feature** |
| **Break into Jobs** | `/jobify` (via Breakdown Specialist) | Orchestrator auto-dispatches on `breaking_down` status | Orchestrator (automatic) |

### Step Detail

**Plan Capability** (CPO, interactive)
- Input: Human's idea/concept + `query_projects()` for context
- Output: Approved capability plan (in-session conversation, not persisted to file)
- Orchestration: CPO skill routing, 8-step interactive process with human
- Handoff: CPO commissions Project Architect via `commission_contractor`

**Featurify** (Project Architect, ephemeral contractor)
- Input: Capability plan from commission context
- Output: `batch_create_features()` → features at `created` status
- Orchestration: Orchestrator dispatches contractor job
- Handoff: Features exist in DB → CPO must discover them and spec each one

**Spec Feature** (CPO, interactive)
- Input: Feature ID via `query_features()`, iterative refinement with human
- Output: `create_feature()` or `update_feature()` → feature enters `breaking_down`
- Orchestration: CPO manually processes each feature, 7-step interactive process
- Handoff: Feature status change triggers orchestrator

**Jobify** (Breakdown Specialist, ephemeral contractor)
- Input: Feature spec + acceptance_tests from `query_features()`
- Output: `batch_create_jobs()` → all jobs at `queued` status
- Orchestration: **Fully automatic** — orchestrator detects `breaking_down`, dispatches contractor
- Handoff: Jobs dispatch to machines automatically

### Where the Human is the Glue
1. Plan-capability → featurify: CPO must manually commission Project Architect
2. Featurify → spec-feature: **Biggest gap** — CPO must discover that features were created, then manually pick up `/spec-feature` for each one. No notification, no auto-continuation.
3. Spec-feature → jobify: **Already automatic** via orchestrator status detection

### Plugin Opportunity
**The featurify → spec-feature handoff is the main bottleneck.** When Project Architect creates features, CPO should be notified and prompted to spec each one. Better yet: for simple features, the spec could be auto-generated from the capability plan and presented for approval rather than built interactively from scratch. The plan-capability → commission flow is also manual when it could be a single plugin that chains plan → structure → spec with human gates only at approval points.

---

## 3. Idea Hardening Pipeline: `harden → review-plan → spec-feature`

### Current Flow

| Step | Skill | Trigger | Who's the Glue |
|------|-------|---------|----------------|
| **Workshop** (Stage 1) | `/brainstorming` (nested in `/harden`) | Human calls `/harden {idea_id}` | **Human initiates** |
| **Prior Art + Impact Scan** (Stages 2a-2c) | Internal to `/harden` | Automatic after workshop | Skill internal (automatic) |
| **Plan Generation** (Stage 2c) | Internal to `/harden` | Automatic | Skill internal (automatic) |
| **Second Opinions** (Stage 3) | Codex, Gemini, CTO (parallel) | Automatic | Skill internal (automatic) |
| **Synthesis** (Stage 4) | Internal to `/harden` | Automatic after reviews | Skill internal (automatic) |
| **Gap Review** (Stage 5) | `/review-plan` (nested) | Automatic | Skill internal (automatic) |
| **Write-up** (Stage 6) | Internal to `/harden` | Automatic | Skill internal (automatic) |
| **Human Approval** | — | Human reviews hardened plan | **Human decision gate** |
| **Plan into Features** | `/plan-capability` → featurify → spec-feature → jobify | CPO re-engages | **Feeds into Pipeline #2** |

### Step Detail

**Harden** (6 stages, mostly automatic after initiation)
- Input: Idea ID or file path
- Output: Design doc at `docs/plans/active/{date}-{slug}-design.md` (v2 after synthesis), review docs
- Orchestration: **Stages 2-6 are already chained internally** — this is the closest thing to a plugin we have today
- The skill itself orchestrates sub-skills (brainstorming, review-plan, second-opinion, codex-delegate, gemini-subagent)

**Review-Plan** (Stage 5, nested)
- Input: v2 plan document
- Output: Gap analysis applied to plan, unfixable gaps → Risks section
- Orchestration: Invoked automatically within `/harden` Stage 5

**Post-Hardening → Feature Planning**
- Input: Hardened plan doc + human approval
- Output: Human tells CPO to proceed → CPO runs `/plan-capability` with existing plan
- Orchestration: **Fully manual** — human must review plan, approve, then re-engage CPO

### Where the Human is the Glue
1. Initiation: Human must call `/harden` — no auto-detection of ideas that need hardening
2. **Post-hardening → plan-capability: Biggest gap.** After hardening completes, the plan sits in `docs/plans/active/` waiting for human to read it, approve it, and tell CPO to proceed. There's no status tracking, no "hardened and ready for approval" state, no notification.
3. The `create_capability` MCP tool referenced in the design doc doesn't exist yet — no way to programmatically track hardening status

### Plugin Opportunity
**Harden is already 80% a plugin internally** (stages chain automatically). The missing piece is the **exit**: when hardening completes, the idea should move to a `hardened` status with the plan doc linked, and CPO should be notified to present it for human approval. Right now the plan just appears as a file with no connection back to the idea or the pipeline. Adding a `hardened` status + plan_doc_path on ideas would close the loop and let the idea processing pipeline pick it up: `triage → enrich → promote-to-capability → harden → approve → plan-capability → spec → jobify`.

---

## Summary: Glue Map

```
IDEA PROCESSING          FEATURE PLANNING           IDEA HARDENING
═══════════════          ════════════════           ═══════════════

  [triage]                [plan-capability]           [harden]
     │                         │                     ┌──┤ Stages 2-6
     │ human clicks            │ CPO commissions     │  │ automatic
     ▼                         ▼                     │  ▼
  [enrich]                [featurify]              [review-plan]
     │                         │                     │
     │ human clicks            │ ← BIGGEST GAP       │ plan file sits
     ▼                         │   no notification    │ waiting
  [promote]                    ▼                     ▼
     │                    [spec-feature]          [human approval]
     │ edge function           │                     │
     ▼                         │ CPO per-feature     │ ← BIGGEST GAP
  (done)                       ▼                     │   no status, no link
                          [jobify]                   ▼
                               │               [plan-capability]
                               │ orchestrator       (feeds into #2)
                               ▼
                          (jobs dispatched)

Legend:
  ─── manual/human glue
  ═══ automatic/orchestrator
```

## Recommended Plugin Priority

1. **Idea Processing Plugin** — highest ROI, we just lived the pain. Triage → auto-enrich → present for decision. Only human gate: promote/park/reject.
2. **Feature Planning Plugin** — most human glue-time. Close the featurify → spec-feature gap with notifications + auto-continuation for simple features.
3. **Idea Hardening Plugin** — already 80% there. Just needs exit wiring: `hardened` status + plan linkage + CPO notification.
