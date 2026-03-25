CREATE TABLE job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('lifecycle', 'tmux')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, type)
);

CREATE INDEX idx_job_logs_job_id_type ON job_logs(job_id, type);
CREATE INDEX idx_job_logs_created_at ON job_logs(created_at);

ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read job_logs"
  ON job_logs FOR SELECT USING (true);

CREATE POLICY "Service role full access to job_logs"
  ON job_logs FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION append_job_log(p_job_id uuid, p_type text, p_chunk text)
RETURNS void AS $$
  INSERT INTO job_logs (job_id, type, content, updated_at)
  VALUES (p_job_id, p_type, p_chunk, now())
  ON CONFLICT (job_id, type)
  DO UPDATE SET
    content = job_logs.content || EXCLUDED.content,
    updated_at = now();
$$ LANGUAGE sql;

INSERT INTO job_logs (job_id, type, content, created_at, updated_at)
SELECT id, 'tmux', raw_log, created_at, COALESCE(completed_at, now())
FROM jobs
WHERE raw_log IS NOT NULL AND raw_log != '';

DROP FUNCTION IF EXISTS append_raw_log(uuid, text);
ALTER TABLE jobs DROP COLUMN IF EXISTS raw_log;
