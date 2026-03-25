-- Autonomous worker reports table
-- Workers (x-scout, staging-patrol, etc.) write observations, alerts, and bug reports here.
-- Service role writes, authenticated users read their own company's reports.

CREATE TABLE IF NOT EXISTS public.worker_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   TEXT        NOT NULL,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'observation',
  summary     TEXT        NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_reports_worker_id ON public.worker_reports (worker_id);
CREATE INDEX idx_worker_reports_company_created ON public.worker_reports (company_id, created_at DESC);
CREATE INDEX idx_worker_reports_type ON public.worker_reports (type);

ALTER TABLE public.worker_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.worker_reports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_own_company" ON public.worker_reports
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
    )
  );
