-- 121_seed_capabilities.sql
-- Seed capability lanes and capabilities audited on 2026-03-07.

WITH company AS (
    SELECT id
    FROM public.companies
    LIMIT 1
),
lane_seed (lane_key, lane_name, sort_order) AS (
    VALUES
        ('brain', 'Agent Brain', 1),
        ('identity', 'Agent Identity', 2),
        ('infra', 'Infrastructure', 3),
        ('pipeline', 'Pipeline', 4),
        ('interface', 'Interface', 5),
        ('platform', 'Platform', 6),
        ('strategy', 'Strategy', 7)
),
inserted_lanes AS (
    INSERT INTO public.capability_lanes (
        company_id,
        name,
        sort_order
    )
    SELECT
        company.id,
        lane_seed.lane_name,
        lane_seed.sort_order
    FROM company
    JOIN lane_seed ON true
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.capability_lanes existing_lane
        WHERE existing_lane.company_id = company.id
          AND existing_lane.name = lane_seed.lane_name
    )
    RETURNING id, name
),
all_lanes AS (
    SELECT
        capability_lanes.name,
        MIN(capability_lanes.id) AS id
    FROM company
    JOIN public.capability_lanes
        ON capability_lanes.company_id = company.id
    JOIN lane_seed
        ON lane_seed.lane_name = capability_lanes.name
    GROUP BY capability_lanes.name
),
capability_seed (
    lane_key,
    title,
    icon,
    status,
    progress,
    sort_order,
    tooltip
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
),
inserted_capabilities AS (
    INSERT INTO public.capabilities (
        company_id,
        lane_id,
        title,
        icon,
        status,
        progress,
        depends_on,
        sort_order,
        tooltip
    )
    SELECT
        company.id,
        all_lanes.id,
        capability_seed.title,
        capability_seed.icon,
        capability_seed.status,
        capability_seed.progress,
        '{}'::uuid[],
        capability_seed.sort_order,
        capability_seed.tooltip
    FROM company
    JOIN capability_seed ON true
    JOIN lane_seed
        ON lane_seed.lane_key = capability_seed.lane_key
    JOIN all_lanes
        ON all_lanes.name = lane_seed.lane_name
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.capabilities existing_capability
        WHERE existing_capability.company_id = company.id
          AND existing_capability.title = capability_seed.title
    )
    RETURNING id
)
SELECT COUNT(*)
FROM inserted_capabilities;

WITH company AS (
    SELECT id
    FROM public.companies
    LIMIT 1
),
capability_seed (title) AS (
    VALUES
        ('Personality'),
        ('Memory P1'),
        ('Doctrines'),
        ('Memory P2'),
        ('Canons'),
        ('Auto-Spec'),
        ('Roles & Prompts'),
        ('Persistent Identity'),
        ('Bootstrap Parity'),
        ('Future Roles'),
        ('Data Model'),
        ('Orchestrator'),
        ('Deep Heartbeat'),
        ('Triggers & Events'),
        ('Auto-Greenlight'),
        ('Pipeline Engine'),
        ('Contractors'),
        ('Verification'),
        ('Monitoring Agent'),
        ('Product Intelligence'),
        ('CLI & Agent'),
        ('Terminal CPO'),
        ('Gateway (Slack)'),
        ('Interactive Jobs'),
        ('Multi-Channel'),
        ('WebUI'),
        ('Model Flexibility'),
        ('Roles Marketplace'),
        ('Local Models'),
        ('Goals & Focus'),
        ('Health Scoring'),
        ('Strategy Sim')
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
        dependency_seed.title,
        COALESCE(
            array_agg(dep.id ORDER BY dependency_seed.dep_order)
                FILTER (WHERE dep.id IS NOT NULL),
            '{}'::uuid[]
        ) AS depends_on_ids
    FROM dependency_seed
    JOIN company ON true
    LEFT JOIN public.capabilities dep
        ON dep.company_id = company.id
       AND dep.title = dependency_seed.depends_on_title
    GROUP BY dependency_seed.title
),
resolved_dependencies AS (
    SELECT
        target.id,
        COALESCE(dependency_arrays.depends_on_ids, '{}'::uuid[]) AS depends_on_ids
    FROM company
    JOIN public.capabilities target
        ON target.company_id = company.id
    JOIN capability_seed
        ON capability_seed.title = target.title
    LEFT JOIN dependency_arrays
        ON dependency_arrays.title = target.title
)
UPDATE public.capabilities capabilities
SET depends_on = resolved_dependencies.depends_on_ids
FROM resolved_dependencies
WHERE capabilities.id = resolved_dependencies.id
  AND capabilities.depends_on IS DISTINCT FROM resolved_dependencies.depends_on_ids;
