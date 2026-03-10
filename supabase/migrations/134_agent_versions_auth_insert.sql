CREATE POLICY "Authenticated users can insert agent_versions"
  ON agent_versions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
