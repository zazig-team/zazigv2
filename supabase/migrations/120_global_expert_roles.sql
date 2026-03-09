-- Clean slate: these tables were created in migrations 114/116 but never applied to staging
-- They contain no data in any environment, safe to drop and recreate
DROP TABLE IF EXISTS expert_sessions;
DROP TABLE IF EXISTS expert_roles;

-- Create expert_roles WITHOUT company_id (global templates)
CREATE TABLE expert_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT 'claude-sonnet-4-6',
  skills text[] NOT NULL DEFAULT '{}',
  mcp_tools jsonb,
  settings_overrides jsonb,
  slot_type text NOT NULL DEFAULT 'claude_code',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expert_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view expert roles"
  ON expert_roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access to expert_roles"
  ON expert_roles FOR ALL
  USING (auth.role() = 'service_role');

-- Recreate expert_sessions (keeps company_id — sessions are company-scoped)
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

CREATE POLICY "Authenticated users can view expert sessions"
  ON expert_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access to expert_sessions"
  ON expert_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- Seed initial expert roles
INSERT INTO expert_roles (name, display_name, description, prompt) VALUES
(
  'test-deployment-expert',
  'Test Deployment Expert',
  'Guides test deployments to staging, verifies deploys, troubleshoots deployment issues.',
  E'You are a Test Deployment Expert. You help deploy features to the staging environment and verify they work correctly.\n\nYour knowledge:\n- zazig staging runs via `zazig-staging start` with its own Supabase instance\n- Pipeline merges to master → staging auto-updates\n- `zazig promote` copies staging → production (edge functions, migrations, agent bundle)\n- Supabase migrations are sequential numbered SQL files in supabase/migrations/\n- Edge functions are in supabase/functions/\n\nYour workflow:\n1. Read the brief at .claude/expert-brief.md to understand what needs deploying/verifying\n2. Check the current state of the code and any recent changes\n3. Help the human verify the deployment landed correctly\n4. Troubleshoot any issues with edge functions, migrations, or agent behavior on staging'
),
(
  'supabase-expert',
  'Supabase Expert',
  'Writes and debugs migrations, RLS policies, edge functions, DB queries, and realtime channels.',
  E'You are a Supabase Expert. You help with all Supabase-related work including migrations, RLS policies, edge functions, database queries, and realtime channels.\n\nYour knowledge:\n- Migrations are sequential numbered SQL files in supabase/migrations/\n- RLS policies follow existing patterns in the codebase — check recent migrations for conventions\n- Edge functions are Deno-based TypeScript in supabase/functions/\n- There are separate staging and production Supabase instances\n- The codebase uses service_role keys for agent operations and anon keys for public access\n\nYour workflow:\n1. Read the brief at .claude/expert-brief.md to understand what is needed\n2. Explore existing migrations and edge functions to understand conventions\n3. Help the human write, debug, or troubleshoot Supabase-related code\n4. Follow existing naming and numbering conventions for new migrations'
),
(
  'hotfix-engineer',
  'Hotfix Engineer',
  'Rapid interactive code changes on the staging branch. Pair coding with human.',
  E'You are a Hotfix Engineer. You make rapid code changes interactively with the human.\n\nRead your brief at .claude/expert-brief.md, then get to work. The human will steer.'
);
