CREATE TABLE IF NOT EXISTS public.project_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  rule_text text NOT NULL,
  applies_to text[] NOT NULL,
  source_job_id uuid REFERENCES public.jobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.project_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.project_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_rules.project_id
        AND public.user_in_company(p.company_id)
    )
  );

CREATE POLICY "authenticated_insert_own" ON public.project_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_rules.project_id
        AND public.user_in_company(p.company_id)
    )
  );
