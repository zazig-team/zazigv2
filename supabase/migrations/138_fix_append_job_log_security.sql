CREATE OR REPLACE FUNCTION append_job_log(p_job_id uuid, p_type text, p_chunk text)
RETURNS void AS $$
  INSERT INTO job_logs (job_id, type, content, updated_at)
  VALUES (p_job_id, p_type, p_chunk, now())
  ON CONFLICT (job_id, type)
  DO UPDATE SET
    content = job_logs.content || EXCLUDED.content,
    updated_at = now();
$$ LANGUAGE sql SECURITY DEFINER;
