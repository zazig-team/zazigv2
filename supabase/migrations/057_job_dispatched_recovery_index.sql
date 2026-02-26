-- 057: Add composite index for local agent job recovery polling.
-- The agent polls every 30s for jobs stuck in 'dispatched' status.
-- Without this index, each poll does a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_dispatched_recovery
  ON public.jobs (status, machine_id, updated_at)
  WHERE status = 'dispatched';
