CREATE TABLE agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env text NOT NULL CHECK (env IN ('staging', 'production')),
  version text NOT NULL,
  commit_sha text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(env, version)
);

CREATE INDEX idx_agent_versions_env_created ON agent_versions(env, created_at DESC);

ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read agent_versions"
  ON agent_versions FOR SELECT USING (true);

CREATE POLICY "Service role full access to agent_versions"
  ON agent_versions FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE machines ADD COLUMN IF NOT EXISTS agent_version text;

INSERT INTO agent_versions (env, version, commit_sha) VALUES
  ('staging', '0.1.0', 'initial'),
  ('production', '0.1.0', 'initial');
