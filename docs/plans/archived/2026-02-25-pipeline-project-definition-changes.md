# Pipeline Design Doc: Project Definition Changes

**Date:** 2026-02-25
**Triggered by:** Chris Evans clarification on project semantics
**Affects:** `2026-02-24-idea-to-job-pipeline-design.md`

---

## The change

**Before:** "Project" = a mid-level grouping created frequently for multi-feature initiatives. "User Authentication" would be its own project with 3 features.

**After:** "Project" = a repository-level product, created rarely. zazigv2 is one project. A new project means a new repo. Multi-feature initiatives are just multiple features under the same project.

## Specific edits needed

### 1. Stage 2 triage (lines ~214-218)

**Current:**
```
1. A feature for an existing project — skip to Stage 4
2. A new capability requiring a project — Stage 2 (planning) → Stage 3
3. A quick fix / standalone job — Entry Point B
```

**Change to:**
```
1. A single feature — skip to Stage 4, create under existing project
2. A multi-feature initiative — Stage 2 (planning), then create multiple features under the existing project
3. A quick fix / standalone job — Entry Point B
4. A genuinely new product/repo — rare, Stage 2 (deep planning) → Stage 3 (new project creation)
```

### 2. Project Architect role (lines ~262-287)

**Current:** "Every project is created by a Project Architect contractor. No exceptions."

**Change to:** The Project Architect's primary job is structuring multi-feature initiatives into feature outlines within an existing project. Creating a new project (new repo) is rare and still goes through the architect, but the common case is `batch_create_features` under an existing `project_id`, not `create_project`.

### 3. Doctrine (line ~670)

**Current:** "Every capability that spans multiple features needs a project — no exceptions"

**Change to:** "Every capability that spans multiple features needs a planning step and structured feature outlines — but not necessarily a new project. Features are grouped under the project (repo) they belong to. A new project means a new repository."

### 4. Stage overview (lines ~36-55)

**Current:**
```
[2] PLANNING         CPO + Human refine scope, decide project vs feature
[3] STRUCTURING      Project Architect creates project + feature outlines
```

**Change to:**
```
[2] PLANNING         CPO + Human refine scope, decide single feature vs multi-feature initiative
[3] STRUCTURING      Project Architect creates feature outlines (new project only if new repo needed)
```

### 5. CPO triage skill prompt (lines ~627-634)

**Current:**
```
1. Assess scope — query existing projects, ask clarifying questions
2. Quick fix with no project context → standalone job
3. Single feature for existing project → /spec-feature
4. Multi-feature capability → planning mode
   - Commissions Project Architect when plan is approved
```

**Change to:**
```
1. Assess scope — query existing projects, ask clarifying questions
2. Quick fix → standalone job
3. Single feature → /spec-feature (create under existing project)
4. Multi-feature initiative → planning mode
   - Commissions Project Architect to create feature outlines under existing project
5. New product/repo (rare) → deep planning → Project Architect creates new project
```

### 6. Example walkthrough B (lines ~780-788)

**Current:** "Project Architect: Creates project 'User Authentication' with 3 feature outlines."

**Change to:** "Project Architect: Creates 3 feature outlines under the zazigv2 project for User Authentication: OAuth Provider Integration, Session Management, Permission Model."

### 7. MCP tool scoping table (line ~421)

No change needed — `create_project` still exists for the rare case. But add a note: "Used rarely — most work creates features under existing projects."

### 8. Stage ownership table (line ~196)

**Current:** "Project record + feature outlines in Supabase"

**Change to:** "Feature outlines in Supabase (new project record only if new repo)"

## DB cleanup needed

| Project | Action |
|---|---|
| zazigv2 | Keep — this is THE project |
| Pipeline Infrastructure | Merge features into zazigv2, then delete project |
| Pipeline Integration Test | Merge features into zazigv2, then delete project |

### 9. New: `features.tags` column for initiative grouping

With projects now meaning repo-level products, we lose the mid-level grouping that "projects" used to provide. A `tags` field on features fills this gap without adding structural complexity.

**Migration:**
```sql
ALTER TABLE features ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE INDEX idx_features_tags ON features USING GIN (tags);
```

**Semantics:**
- Tags are free-form labels that group related features for reporting/filtering
- Example: features for "User Authentication" initiative all get `['user-auth']`
- A feature can have multiple tags (e.g. `['user-auth', 'security', 'q1-initiative']`)
- Tags are set during feature creation — `create_feature` and `batch_create_features` MCP tools need a `tags` parameter
- The Project Architect assigns tags when creating feature outlines for a multi-feature initiative
- Single features created via `/spec-feature` get tags from the CPO if relevant

**Pipeline doc updates needed:**
- Stage 3 output: "Feature outlines in Supabase **with initiative tags**"
- Project Architect role: "assigns shared tags to features belonging to the same initiative"
- MCP tool scoping table: add `tags` parameter to `create_feature` and `batch_create_features`
- CPO triage prompt: mention tags as the grouping mechanism for multi-feature initiatives

**Query pattern:**
```sql
-- All features for an initiative
SELECT * FROM features WHERE 'user-auth' = ANY(tags) AND project_id = ?;

-- All active initiatives (distinct tag sets)
SELECT DISTINCT unnest(tags) AS tag, COUNT(*)
FROM features WHERE project_id = ?
GROUP BY tag;
```

## What does NOT change

- Feature-level flow (Stage 4→5→6→7) — unchanged
- Breakdown Specialist behaviour — unchanged
- Job structure and DAG dependencies — unchanged
- MCP tools — all still exist, just used differently
- The Project Architect role — still exists, just creates new projects less often
