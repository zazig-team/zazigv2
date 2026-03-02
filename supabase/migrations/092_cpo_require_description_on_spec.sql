-- 091_cpo_require_description_on_spec.sql
-- Appends a reminder to the CPO role prompt: description is a required field
-- on every update_feature call that sets a spec. Features promoted from ideas
-- and fast-tracked often end up with a null description, making the dashboard
-- and pipeline snapshots harder to scan.

UPDATE public.roles
SET prompt = prompt || E'\n\n---\n\n## Feature Description Requirement\n\nEvery `update_feature` call that sets a `spec` MUST also set a `description`.\n\nThe `description` is the 1-2 sentence elevator pitch visible on the dashboard and in pipeline snapshots. It answers "what does this feature do?" in plain English. Never leave it null when writing a spec.\n\nThis applies to:\n- /spec-feature: include `description` in the same `update_feature` call as `spec`\n- Fast-tracked features: set `description` before or when marking `ready_for_breakdown`\n- Any time you call `update_feature` with a `spec` field\n\nIf you notice an existing feature has a spec but no description, add one.'
WHERE name = 'cpo';
