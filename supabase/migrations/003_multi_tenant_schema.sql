-- zazigv2 multi-tenant schema migration
-- Date: 2026-02-19
-- Supersedes: 001_initial_schema.sql and 002_enable_realtime.sql
-- Purpose: Replace the initial 3-table schema (machines, jobs, events) with the full
--   multi-tenant data model specified in docs/plans/2026-02-19-zazigv2-data-model.md
--
-- Entity hierarchy:
--   roles (global — platform-defined)
--   companies (tenant boundary)
--   ├── company_roles (which roles enabled)
--   ├── machines (contributor laptops, scoped to company)
--   ├── projects
--   │   └── features (product work)
--   │       └── jobs (execution units)
--   ├── jobs (company-scoped, no feature — persistent agents, bugs)
--   ├── messages (per-job communication)
--   ├── events (lifecycle log)
--   └── memory_chunks (agent memory, pgvector)

-- ============================================================
-- Drop old tables (from 001_initial_schema.sql)
-- Order matters: drop dependents before parents.
-- ============================================================

DROP TABLE IF EXISTS public.events   CASCADE;
DROP TABLE IF EXISTS public.jobs     CASCADE;
DROP TABLE IF EXISTS public.machines CASCADE;

-- Drop old shared trigger function (will be recreated below)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================
-- Shared trigger function
-- Reusable across all tables with updated_at columns.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Extensions
-- ============================================================

-- pgvector for semantic search on memory_chunks.embedding
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- roles
-- Global platform table. Defines available agent roles.
-- ============================================================

CREATE TABLE public.roles (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text        NOT NULL UNIQUE,
    prompt         text,
    description    text,
    is_persistent  boolean     NOT NULL DEFAULT false,
    default_model  text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.roles IS
    'Platform-defined agent roles. Companies choose which roles to enable via company_roles. '
    'is_persistent: if true, the orchestrator auto-creates a standing job when a company enables this role, '
    'and redispatches it automatically if it stops or its machine goes offline.';

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.roles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.roles
    FOR SELECT
    TO authenticated
    USING (true);

-- Seed the platform roles
INSERT INTO public.roles (name, description, is_persistent, default_model) VALUES
    ('cpo',      'Chief Product Officer — discusses features with humans, designs them, breaks them into jobs', true,  'opus'),
    ('cto',      'Chief Technology Officer — architecture, tech review, infrastructure decisions',               true,  'opus'),
    ('engineer', 'Software engineer — implements code jobs assigned by the orchestrator',                        false, 'sonnet'),
    ('reviewer', 'Code reviewer — reviews PRs and provides feedback',                                            false, 'sonnet');

-- ============================================================
-- companies
-- Tenant boundary. Everything is scoped to a company.
-- ============================================================

CREATE TABLE public.companies (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'suspended', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.companies IS
    'Tenant boundary. All other tables are scoped to a company via company_id. '
    'status: active (operating normally), suspended (billing or policy hold), archived (churned/deleted).';

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.companies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.companies
    FOR SELECT
    TO authenticated
    USING (id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- company_roles
-- Which roles a company has enabled.
-- ============================================================

CREATE TABLE public.company_roles (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role_id    uuid        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    enabled    boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, role_id)
);

COMMENT ON TABLE public.company_roles IS
    'Which roles a company has enabled. When a company enables a persistent role, '
    'the system auto-creates a standing job for it. '
    'UNIQUE (company_id, role_id) prevents duplicate role assignments per company.';

CREATE TRIGGER company_roles_updated_at
    BEFORE UPDATE ON public.company_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.company_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.company_roles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.company_roles
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- machines
-- Contributor machines that connect to the orchestrator.
-- ============================================================

CREATE TABLE public.machines (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name              text        NOT NULL,
    slots_claude_code int         NOT NULL DEFAULT 0
                                  CHECK (slots_claude_code >= 0),
    slots_codex       int         NOT NULL DEFAULT 0
                                  CHECK (slots_codex >= 0),
    last_heartbeat    timestamptz,
    status            text        NOT NULL DEFAULT 'offline'
                                  CHECK (status IN ('online', 'offline')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

COMMENT ON TABLE public.machines IS
    'Contributor machines registered with the orchestrator. '
    'Slots are total capacity: available slots = total minus count of active jobs on this machine. '
    'No role-specific columns (e.g. no hosts_cpo) — persistent agents are jobs, dispatched dynamically. '
    'UNIQUE (company_id, name) scopes machine names within a tenant.';

CREATE TRIGGER machines_updated_at
    BEFORE UPDATE ON public.machines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_machines_company_id ON public.machines(company_id);

-- Composite unique for cross-tenant FK references from child tables
ALTER TABLE public.machines ADD CONSTRAINT uq_machines_company_id UNIQUE (id, company_id);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.machines
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.machines
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- projects
-- A company's product or repo.
-- ============================================================

CREATE TABLE public.projects (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name       text        NOT NULL,
    repo_url   text,
    status     text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

COMMENT ON TABLE public.projects IS
    'A company product or repository. Features and project-scoped jobs belong here. '
    'No Trello board references — the orchestrator job queue replaces Trello. '
    'UNIQUE (company_id, name) scopes project names within a tenant.';

CREATE INDEX idx_projects_company_id ON public.projects(company_id);

-- Composite unique for cross-tenant FK references from child tables
ALTER TABLE public.projects ADD CONSTRAINT uq_projects_company_id UNIQUE (id, company_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.projects
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.projects
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- features
-- Unit of product work. Human-facing; lives on roadmaps.
-- ============================================================

CREATE TABLE public.features (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    project_id  uuid        NOT NULL,
    title       text        NOT NULL,
    description text,
    status      text        NOT NULL DEFAULT 'proposed'
                            CHECK (status IN ('proposed', 'designing', 'in_progress', 'complete')),
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- Cross-tenant protection: project must belong to the same company
    FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.features IS
    'The unit of product work. Created by humans or CPO. '
    'CPO discusses features with the human, designs them, then breaks them into jobs. '
    'The orchestrator does not see features — it only sees jobs. '
    'created_by: "human" or a role name (e.g. "cpo"). '
    'Cross-tenant FK (project_id, company_id) ensures features cannot reference projects from another company.';

CREATE TRIGGER features_updated_at
    BEFORE UPDATE ON public.features
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_features_company_id  ON public.features(company_id);
CREATE INDEX idx_features_project_id  ON public.features(project_id);

-- Composite unique for cross-tenant FK references from jobs
ALTER TABLE public.features ADD CONSTRAINT uq_features_company_id UNIQUE (id, company_id);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.features
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.features
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- jobs
-- Unit of execution. What the orchestrator dispatches to machines.
-- ============================================================

CREATE TABLE public.jobs (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    project_id   uuid,
    feature_id   uuid,
    role         text        NOT NULL,
    job_type     text        NOT NULL
                             CHECK (job_type IN ('code', 'infra', 'design', 'research', 'docs', 'bug', 'persistent_agent')),
    complexity   text        CHECK (complexity IN ('simple', 'medium', 'complex')),
    slot_type    text        CHECK (slot_type IN ('claude_code', 'codex')),
    machine_id   uuid,
    status       text        NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'dispatched', 'executing', 'waiting_on_human', 'reviewing', 'complete', 'failed')),
    branch       text,
    context      text,
    raw_log      text,
    result       text,
    pr_url       text,
    started_at   timestamptz,
    completed_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    -- Cross-tenant protection: project, feature, and machine must belong to the same company
    FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE SET NULL,
    FOREIGN KEY (feature_id, company_id) REFERENCES public.features(id, company_id) ON DELETE SET NULL,
    FOREIGN KEY (machine_id, company_id) REFERENCES public.machines(id, company_id) ON DELETE SET NULL
);

COMMENT ON TABLE public.jobs IS
    'Unit of execution dispatched by the orchestrator to machines. '
    'project_id and feature_id are nullable: persistent agent jobs and company-wide work have none. '
    'complexity and slot_type are nullable for persistent jobs. '
    'machine_id is set on dispatch, cleared when the job parks or finishes. '
    'Status lifecycle: queued → dispatched → executing → [waiting_on_human | reviewing] → complete | failed. '
    'waiting_on_human: agent posted a question to human, awaiting reply. Agent exits, frees slot. '
    'context: starts as original brief, evolves throughout lifecycle with decisions and summaries. '
    'raw_log: full unedited agent output appended on every flush. Debug trail only. '
    'Persistent agents use job_type = persistent_agent. Orchestrator redispatches if machine goes offline. '
    'Cross-tenant FKs (project_id, feature_id, machine_id all paired with company_id) prevent cross-tenant references.';

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_jobs_company_id  ON public.jobs(company_id);
CREATE INDEX idx_jobs_status      ON public.jobs(status);
CREATE INDEX idx_jobs_machine_id  ON public.jobs(machine_id);
CREATE INDEX idx_jobs_feature_id  ON public.jobs(feature_id);
CREATE INDEX idx_jobs_project_id  ON public.jobs(project_id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.jobs
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- messages
-- Inter-agent and agent-to-human communication, scoped to a job.
-- ============================================================

CREATE TABLE public.messages (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    job_id       uuid        REFERENCES public.jobs(id) ON DELETE CASCADE,
    from_role    text        NOT NULL,
    to_role      text,
    content      text        NOT NULL,
    message_type text        NOT NULL
                             CHECK (message_type IN ('question', 'answer', 'status_update', 'blocked')),
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS
    'Inter-agent and agent-to-human communication scoped to a job. '
    'Replaces Slack threads for agent collaboration. '
    'job_id nullable: rare case of company-wide announcements not tied to a job. '
    'to_role nullable: NULL means broadcast to all job participants. '
    'waiting_on_human pattern: agent posts message with to_role="human", message_type="question", '
    'sets job.status=waiting_on_human. Human reply triggers job back to queued. '
    'Agent-to-agent questions do NOT change job status.';

CREATE INDEX idx_messages_job_id     ON public.messages(job_id);
CREATE INDEX idx_messages_company_id ON public.messages(company_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.messages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.messages
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Authenticated users can post answers (human replies to agent questions)
CREATE POLICY "authenticated_insert_own" ON public.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = (auth.jwt() ->> 'company_id')::uuid
        AND from_role = 'human'
    );

-- ============================================================
-- events
-- Append-only lifecycle log. Scoped to company, tagged with context.
-- ============================================================

CREATE TABLE public.events (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    job_id      uuid        REFERENCES public.jobs(id)     ON DELETE SET NULL,
    machine_id  uuid        REFERENCES public.machines(id) ON DELETE SET NULL,
    role        text,
    event_type  text        NOT NULL
                            CHECK (event_type IN (
                                'job_created', 'job_dispatched', 'job_executing', 'job_complete',
                                'job_failed', 'job_waiting_on_human', 'job_reviewing',
                                'machine_online', 'machine_offline', 'machine_heartbeat',
                                'agent_started', 'agent_stopped', 'agent_memory_flush',
                                'feature_created', 'feature_status_changed',
                                'company_created', 'company_suspended', 'company_archived',
                                'human_reply', 'escalation'
                            )),
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.events IS
    'Append-only lifecycle log for all orchestrator and agent events. '
    'job_id, machine_id, and role are nullable depending on event context. '
    'detail is a free-form JSONB payload — structure varies by event_type. '
    'event_type is constrained to known types — add new types via migration. '
    'Not added to Realtime publication (write-heavy, read-rarely).';

CREATE INDEX idx_events_company_id ON public.events(company_id);
CREATE INDEX idx_events_job_id     ON public.events(job_id);
CREATE INDEX idx_events_created_at ON public.events(created_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.events
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- memory_chunks
-- Agent memory. Replaces QMD + filesystem markdown files from v1.
-- ============================================================

CREATE TABLE public.memory_chunks (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role        text,
    source_path text,
    text        text        NOT NULL,
    embedding   vector(1536),
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.memory_chunks IS
    'Agent memory stored in Supabase. Replaces QMD + local filesystem markdown from v1. '
    'role nullable: NULL = shared memory across all roles for this company. '
    'embedding: pgvector 1536-dimension column for semantic similarity search (OpenAI text-embedding-3-small). '
    'source_path: original file path for dedup and updates. '
    'Written on pre-compaction flush when agent conversation nears context limits. '
    'Agents query via memory_search() tool call. '
    'Not added to Realtime publication (write-heavy, read-rarely).';

CREATE INDEX idx_memory_chunks_company_role ON public.memory_chunks(company_id, role);

-- HNSW index for fast approximate nearest neighbor semantic search
CREATE INDEX idx_memory_chunks_embedding ON public.memory_chunks
    USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.memory_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.memory_chunks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.memory_chunks
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- Realtime
-- jobs, machines, messages receive live subscriptions.
-- events and memory_chunks excluded (write-heavy, read-rarely).
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
