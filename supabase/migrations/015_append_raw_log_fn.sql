-- 015_append_raw_log_fn.sql
-- Adds an RPC helper for append-only raw_log writes.
-- The local agent tracks a byte offset (lastBytesSent) and sends only the
-- newly written chunk on each poll tick, instead of re-sending the full log.

CREATE OR REPLACE FUNCTION append_raw_log(job_id uuid, chunk text)
RETURNS void AS $$
  UPDATE jobs
  SET raw_log = COALESCE(raw_log, '') || chunk
  WHERE id = job_id;
$$ LANGUAGE sql;
