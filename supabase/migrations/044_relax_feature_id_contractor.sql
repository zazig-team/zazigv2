-- 044_relax_feature_id_contractor.sql
-- Relax the jobs_feature_id_required constraint to allow null feature_id
-- for contractor roles that operate at the project level (no feature context).

ALTER TABLE public.jobs DROP CONSTRAINT jobs_feature_id_required;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_feature_id_required
  CHECK (
    feature_id IS NOT NULL
    OR job_type = 'persistent_agent'
    OR role IN ('project-architect', 'breakdown-specialist', 'monitoring-agent')
  );
