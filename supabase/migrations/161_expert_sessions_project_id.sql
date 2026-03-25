-- 161_expert_sessions_project_id.sql
-- Add project_id to expert_sessions so the poll endpoint can include repo_url
-- in the start_expert message (previously only available via Realtime broadcast).

ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
