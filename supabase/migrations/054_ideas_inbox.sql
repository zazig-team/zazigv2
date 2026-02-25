-- zazigv2 Ideas Pipeline Phase 1 — ideas inbox table
-- Date: 2026-02-25
-- Purpose: Create the ideas table for capturing raw ideas from any source,
--   with triage and promotion lifecycle columns. Extends events constraint
--   with idea-related event types.

-- ============================================================
-- ideas
-- Raw idea capture, triage, and promotion pipeline.
-- ============================================================

CREATE TABLE public.ideas (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Capture
    raw_text            text        NOT NULL,
    title               text,
    description         text,
    source              text        CHECK (source IN (
                                        'terminal', 'slack', 'telegram', 'agent', 'web', 'api', 'monitoring'
                                    )),
    originator          text        NOT NULL,
    source_ref          text,

    -- Classification
    scope               text        CHECK (scope IN (
                                        'job', 'feature', 'initiative', 'project', 'research', 'unknown'
                                    )),
    complexity          text        CHECK (complexity IN (
                                        'trivial', 'small', 'medium', 'large', 'unknown'
                                    )),
    domain              text        CHECK (domain IN (
                                        'product', 'engineering', 'marketing', 'cross-cutting', 'unknown'
                                    )),
    autonomy            text        CHECK (autonomy IN (
                                        'exec-can-run', 'needs-human-input', 'needs-human-approval', 'unknown'
                                    )),
    tags                text[],
    flags               text[],

    -- Processing
    clarification_notes text,
    processed_by        text,
    related_ideas       uuid[],
    related_features    uuid[],
    project_id          uuid        REFERENCES public.projects(id) ON DELETE SET NULL,

    -- Status & triage
    status              text        NOT NULL DEFAULT 'new'
                                    CHECK (status IN (
                                        'new', 'triaged', 'promoted', 'parked', 'rejected'
                                    )),
    priority            text        NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN (
                                        'low', 'medium', 'high', 'urgent'
                                    )),
    suggested_exec      text,
    triaged_by          text,
    triaged_at          timestamptz,
    triage_notes        text,

    -- Promotion
    promoted_to_type    text        CHECK (promoted_to_type IN (
                                        'feature', 'job', 'research'
                                    )),
    promoted_to_id      uuid,
    promoted_at         timestamptz,
    promoted_by         text,

    -- Timestamps
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ideas IS
    'Raw idea capture from any source (terminal, Slack, agents, monitoring). '
    'Lifecycle: new → triaged → promoted/parked/rejected. '
    'Promoted ideas become features, jobs, or research tasks. '
    'originator: who submitted the idea (human name or agent role). '
    'source_ref: external reference (Slack message ID, terminal session, etc.).';

-- ============================================================
-- updated_at trigger (same pattern as all other tables)
-- ============================================================

CREATE TRIGGER ideas_updated_at
    BEFORE UPDATE ON public.ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_ideas_company_status   ON public.ideas(company_id, status);
CREATE INDEX idx_ideas_company_domain   ON public.ideas(company_id, domain);
CREATE INDEX idx_ideas_source           ON public.ideas(source);
CREATE INDEX idx_ideas_created_at       ON public.ideas(created_at);
CREATE INDEX idx_ideas_tags             ON public.ideas USING GIN (tags);
CREATE INDEX idx_ideas_flags            ON public.ideas USING GIN (flags);
CREATE INDEX idx_ideas_fts              ON public.ideas USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.ideas
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.ideas
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.ideas
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- events: extend event_type constraint with idea lifecycle events
-- (drop + recreate pattern from migration 008)
-- ============================================================

ALTER TABLE public.events
    DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
    ADD CONSTRAINT events_event_type_check
    CHECK (event_type IN (
        -- Original (003)
        'job_created', 'job_dispatched', 'job_executing', 'job_complete',
        'job_failed', 'job_waiting_on_human', 'job_reviewing',
        'machine_online', 'machine_offline', 'machine_heartbeat',
        'agent_started', 'agent_stopped', 'agent_memory_flush',
        'feature_created', 'feature_status_changed',
        'company_created', 'company_suspended', 'company_archived',
        'human_reply', 'escalation',
        -- Pipeline v2 (008)
        'job_verifying', 'job_verify_failed', 'job_testing', 'job_approved',
        'job_rejected', 'job_done', 'job_cancelled',
        'feature_building', 'feature_verifying', 'feature_testing',
        'feature_done', 'feature_cancelled',
        -- Ideas pipeline (054)
        'idea_created', 'idea_triaged', 'idea_promoted', 'idea_parked', 'idea_rejected'
    ));
