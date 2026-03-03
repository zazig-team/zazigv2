-- 099_deployments_table.sql
-- Track project-level deployments to staging and production.

CREATE TABLE IF NOT EXISTS public.deployments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        REFERENCES public.projects(id),
  company_id       UUID        NOT NULL REFERENCES public.companies(id),
  git_sha          TEXT        NOT NULL,
  environment      TEXT        NOT NULL CHECK (environment IN ('staging', 'production')),
  status           TEXT        NOT NULL DEFAULT 'deployed'
                               CHECK (status IN ('deployed', 'testing', 'fix_required', 'promoted', 'failed')),
  features_included UUID[]     DEFAULT '{}',
  promoted_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at      TIMESTAMPTZ
);

CREATE INDEX idx_deployments_company ON public.deployments(company_id);
CREATE INDEX idx_deployments_env ON public.deployments(environment, status);
CREATE INDEX idx_deployments_created ON public.deployments(created_at DESC);

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on deployments"
  ON public.deployments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users read own company deployments"
  ON public.deployments FOR SELECT TO authenticated
  USING (public.user_in_company(company_id));
