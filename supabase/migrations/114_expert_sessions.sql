CREATE TABLE expert_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expert_role_id uuid NOT NULL REFERENCES expert_roles(id) ON DELETE RESTRICT,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  triggered_by text NOT NULL DEFAULT 'cpo',
  brief text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'running', 'completed', 'cancelled')),
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expert_sessions_company_id ON expert_sessions(company_id);
CREATE INDEX idx_expert_sessions_machine_id ON expert_sessions(machine_id);
CREATE INDEX idx_expert_sessions_status ON expert_sessions(status);

ALTER TABLE expert_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their expert sessions"
  ON expert_sessions FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to expert_sessions"
  ON expert_sessions FOR ALL
  USING (auth.role() = 'service_role');
