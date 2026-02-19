-- zazigv2 initial schema migration
-- Purpose: Orchestration server state for the zazigv2 distributed exec agent system.
--   - machines: registry of local agent machines, their slot capacities, and heartbeat status
--   - jobs: job queue for card-driven work dispatched from cloud orchestrator to local agents
--   - events: append-only event log for all orchestrator and agent lifecycle events
-- All tables use UUIDs, timestamptz columns, and have RLS enabled (permissive for service role).
-- Local agents authenticate with the service role key; anon access is blocked by RLS policies.

-- ============================================================
-- machines
-- ============================================================

CREATE TABLE IF NOT EXISTS machines (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text        NOT NULL UNIQUE,
    slots_claude_code  int         NOT NULL DEFAULT 0,
    slots_codex        int         NOT NULL DEFAULT 0,
    hosts_cpo          boolean     NOT NULL DEFAULT false,
    last_heartbeat     timestamptz,
    status             text        NOT NULL DEFAULT 'offline'
                                   CHECK (status IN ('online', 'offline')),
    created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE machines IS
    'Registry of local agent machines. Each row tracks a contributor machine '
    'that connects to the orchestrator via Supabase Realtime. '
    'slots_claude_code and slots_codex are the total concurrency limits for that machine. '
    'hosts_cpo flags which machine is responsible for keeping the CPO session alive.';

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON machines
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id      text        NOT NULL,
    card_type    text        NOT NULL
                             CHECK (card_type IN ('code', 'infra', 'design', 'research', 'docs')),
    complexity   text        NOT NULL
                             CHECK (complexity IN ('simple', 'medium', 'complex')),
    slot_type    text        NOT NULL
                             CHECK (slot_type IN ('claude_code', 'codex')),
    machine_id   uuid        REFERENCES machines(id),
    status       text        NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'dispatched', 'executing', 'reviewing', 'complete', 'failed')),
    context      text,
    result       text,
    pr_url       text,
    started_at   timestamptz,
    completed_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE jobs IS
    'Job queue for card-driven work. Each row represents one card dispatched by the orchestrator. '
    'Status lifecycle: queued -> dispatched -> executing -> reviewing -> complete | failed. '
    'machine_id is set when the orchestrator assigns a card to a specific local agent machine. '
    'slot_type determines whether a claude_code or codex concurrency slot is consumed.';

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_machine_id ON jobs(machine_id);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- events
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type  text        NOT NULL,
    card_id     text,
    machine_id  uuid        REFERENCES machines(id),
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE events IS
    'Append-only event log for all orchestrator and local agent lifecycle events. '
    'event_type examples: machine_connected, machine_offline, job_dispatched, job_complete, job_failed, cpo_restarted, cpo_failover. '
    'detail is a free-form JSONB payload -- structure varies by event_type. '
    'Replaces cpo-events.log and vpe-state.json from the legacy zazig architecture.';

CREATE INDEX IF NOT EXISTS idx_events_card_id    ON events(card_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
