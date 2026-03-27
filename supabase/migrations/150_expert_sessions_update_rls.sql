-- Allow authenticated users (daemon with JWT) to update expert_sessions.
-- The daemon needs to transition status (requested → running → completed/failed).
-- Previously only service_role could write, causing silent update failures.

CREATE POLICY "Authenticated users can update expert sessions"
  ON expert_sessions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
