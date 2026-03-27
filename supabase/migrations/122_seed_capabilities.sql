-- 122_seed_capabilities.sql
-- Seed capability lanes and capabilities audited on 2026-03-07.
-- NOTE: This migration originally used a single CTE for lanes + capabilities,
-- which failed due to PostgreSQL CTE snapshot isolation (capabilities INSERT
-- couldn't see lanes inserted in the same WITH statement). Fixed by splitting
-- into two separate statements. See 124_seed_capabilities_remediation.sql for
-- the remediation migration that backfills on databases where this already ran.

-- Statement 1: Seed lanes
INSERT INTO public.capability_lanes (company_id, name, sort_order)
SELECT
    company.id,
    lane.lane_name,
    lane.sort_order
FROM (SELECT id FROM public.companies LIMIT 1) company
CROSS JOIN (
    VALUES
        ('Agent Brain', 1),
        ('Agent Identity', 2),
        ('Infrastructure', 3),
        ('Pipeline', 4),
        ('Interface', 5),
        ('Platform', 6),
        ('Strategy', 7)
) AS lane(lane_name, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.capability_lanes existing
    WHERE existing.company_id = company.id
      AND existing.name = lane.lane_name
);

-- Statement 2: Seed capabilities (runs after lanes are committed)
WITH company AS (
    SELECT id FROM public.companies LIMIT 1
),
all_lanes AS (
    SELECT cl.name, cl.id
    FROM company
    JOIN public.capability_lanes cl ON cl.company_id = company.id
),
lane_map (lane_key, lane_name) AS (
    VALUES
        ('brain', 'Agent Brain'),
        ('identity', 'Agent Identity'),
        ('infra', 'Infrastructure'),
        ('pipeline', 'Pipeline'),
        ('interface', 'Interface'),
        ('platform', 'Platform'),
        ('strategy', 'Strategy')
),
capability_seed (
    lane_key, title, icon, status, progress, sort_order, tooltip
) AS (
    VALUES
        ('brain', 'Personality', '🧬', 'shipped', 90, 0, '9 numeric dimensions per archetype. Compiled into prompt at dispatch.'),
        ('brain', 'Memory P1', '🧠', 'active', 20, 1, 'memories table not yet deployed. Design complete.'),
        ('brain', 'Doctrines', '📜', 'draft', 5, 2, 'Design doc approved, zero implementation.'),
        ('brain', 'Memory P2', '🗃️', 'locked', 0, 3, 'Blocked by Memory P1.'),
        ('brain', 'Canons', '🔒', 'locked', 0, 4, 'Blocked by Doctrines.'),
        ('brain', 'Auto-Spec', '⚙️', 'locked', 0, 5, 'Blocked by Canons and Auto-Greenlight.'),

        ('identity', 'Roles & Prompts', '🎭', 'shipped', 95, 0, 'All 7 roles with prompts, skills, MCP tools.'),
        ('identity', 'Persistent Identity', '🪪', 'active', 75, 1, 'Role-agnostic executor works. subAgentPrompt gap.'),
        ('identity', 'Bootstrap Parity', '🔄', 'active', 5, 2, 'Feature branch exists, never merged.'),
        ('identity', 'Future Roles', '🚀', 'locked', 0, 3, 'Blocked by Bootstrap Parity.'),

        ('infra', 'Data Model', '🗄️', 'shipped', 95, 0, '119 migrations, 17+ tables.'),
        ('infra', 'Orchestrator', '🎛️', 'shipped', 85, 1, 'DAG dispatch works. Advanced features designed only.'),
        ('infra', 'Deep Heartbeat', '💓', 'active', 25, 2, 'Machine-level only. Per-job health not built.'),
        ('infra', 'Triggers & Events', '⚡', 'active', 15, 3, 'Events table exists. 7 subsystems designed, almost none built.'),
        ('infra', 'Auto-Greenlight', '🟢', 'locked', 0, 4, 'Only a proposal, not designed.'),

        ('pipeline', 'Pipeline Engine', '🔧', 'shipped', 95, 0, '8/8 tests pass. CPO context assembly not wired.'),
        ('pipeline', 'Contractors', '👷', 'shipped', 90, 1, 'Core pattern works. Market research contractor not deployed.'),
        ('pipeline', 'Verification', '✅', 'shipped', 75, 2, 'Active AC testing works. Entry Point C automation missing.'),
        ('pipeline', 'Monitoring Agent', '👁️', 'locked', 5, 3, 'Role stub in DB, design complete. Blocked by Triggers.'),
        ('pipeline', 'Product Intelligence', '💡', 'locked', 10, 4, 'Ideas table + inbox concept partially built.'),

        ('interface', 'CLI & Agent', '💻', 'shipped', 95, 0, 'Core v1 complete.'),
        ('interface', 'Terminal CPO', '🖥️', 'shipped', 85, 1, 'Works. Slack inbound missing.'),
        ('interface', 'Gateway (Slack)', '📨', 'active', 50, 2, 'Outbound works. Socket Mode inbound missing.'),
        ('interface', 'Interactive Jobs', '🤝', 'active', 35, 3, 'Executor + MCP foundation done. Orchestrator dispatch missing.'),
        ('interface', 'Multi-Channel', '📡', 'active', 10, 4, 'Telegram deployed. Discord absent.'),

        ('platform', 'WebUI', '🌐', 'active', 65, 0, 'Auth, pipeline, team, realtime, roadmap all working.'),
        ('platform', 'Model Flexibility', '🔀', 'draft', 5, 1, 'Comprehensive design doc, zero implementation.'),
        ('platform', 'Roles Marketplace', '🏪', 'locked', 0, 2, 'Not yet designed.'),
        ('platform', 'Local Models', '🏠', 'locked', 0, 3, 'Not yet designed.'),

        ('strategy', 'Goals & Focus', '🎯', 'shipped', 65, 0, 'Tables + MCP tools + UI working. health column missing.'),
        ('strategy', 'Health Scoring', '📊', 'draft', 25, 1, 'Manual v1 done. Missing health column blocker.'),
        ('strategy', 'Strategy Sim', '🧮', 'locked', 5, 2, 'Decisions table + edge function exist.')
)
INSERT INTO public.capabilities (
    company_id, lane_id, title, icon, status, progress, depends_on, sort_order, tooltip
)
SELECT
    company.id,
    all_lanes.id,
    cs.title,
    cs.icon,
    cs.status,
    cs.progress,
    '{}'::uuid[],
    cs.sort_order,
    cs.tooltip
FROM company
JOIN capability_seed cs ON true
JOIN lane_map lm ON lm.lane_key = cs.lane_key
JOIN all_lanes ON all_lanes.name = lm.lane_name
WHERE NOT EXISTS (
    SELECT 1
    FROM public.capabilities existing
    WHERE existing.company_id = company.id
      AND existing.title = cs.title
);

-- Statement 3: Wire up depends_on references
WITH company AS (
    SELECT id FROM public.companies LIMIT 1
),
dependency_seed (title, depends_on_title, dep_order) AS (
    VALUES
        ('Memory P1', 'Personality', 1),
        ('Doctrines', 'Personality', 1),
        ('Memory P2', 'Memory P1', 1),
        ('Canons', 'Doctrines', 1),
        ('Auto-Spec', 'Canons', 1),
        ('Auto-Spec', 'Auto-Greenlight', 2),

        ('Persistent Identity', 'Roles & Prompts', 1),
        ('Bootstrap Parity', 'Persistent Identity', 1),
        ('Future Roles', 'Bootstrap Parity', 1),

        ('Orchestrator', 'Data Model', 1),
        ('Deep Heartbeat', 'Orchestrator', 1),
        ('Triggers & Events', 'Orchestrator', 1),
        ('Auto-Greenlight', 'Triggers & Events', 1),

        ('Contractors', 'Pipeline Engine', 1),
        ('Verification', 'Contractors', 1),
        ('Monitoring Agent', 'Triggers & Events', 1),
        ('Product Intelligence', 'Monitoring Agent', 1),

        ('Terminal CPO', 'CLI & Agent', 1),
        ('Gateway (Slack)', 'Terminal CPO', 1),
        ('Interactive Jobs', 'Gateway (Slack)', 1),
        ('Multi-Channel', 'Interactive Jobs', 1),

        ('Model Flexibility', 'WebUI', 1),
        ('Roles Marketplace', 'Model Flexibility', 1),
        ('Local Models', 'Roles Marketplace', 1),

        ('Health Scoring', 'Goals & Focus', 1),
        ('Strategy Sim', 'Health Scoring', 1)
),
dependency_arrays AS (
    SELECT
        ds.title,
        COALESCE(
            array_agg(dep.id ORDER BY ds.dep_order)
                FILTER (WHERE dep.id IS NOT NULL),
            '{}'::uuid[]
        ) AS depends_on_ids
    FROM dependency_seed ds
    JOIN company ON true
    LEFT JOIN public.capabilities dep
        ON dep.company_id = company.id
       AND dep.title = ds.depends_on_title
    GROUP BY ds.title
),
resolved AS (
    SELECT
        target.id,
        COALESCE(da.depends_on_ids, '{}'::uuid[]) AS depends_on_ids
    FROM company
    JOIN public.capabilities target ON target.company_id = company.id
    LEFT JOIN dependency_arrays da ON da.title = target.title
    WHERE da.depends_on_ids IS NOT NULL
)
UPDATE public.capabilities c
SET depends_on = resolved.depends_on_ids
FROM resolved
WHERE c.id = resolved.id
  AND c.depends_on IS DISTINCT FROM resolved.depends_on_ids;
