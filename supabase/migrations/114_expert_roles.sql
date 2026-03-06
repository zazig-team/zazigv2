CREATE TABLE expert_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT 'claude-sonnet-4-6',
  skills text[] NOT NULL DEFAULT '{}',
  mcp_tools jsonb,
  settings_overrides jsonb,
  slot_type text NOT NULL DEFAULT 'claude_code',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE expert_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their expert roles"
  ON expert_roles FOR SELECT
  USING (company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to expert_roles"
  ON expert_roles FOR ALL
  USING (auth.role() = 'service_role');
