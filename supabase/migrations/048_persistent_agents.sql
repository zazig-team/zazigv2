-- 048: Create persistent_agents table
-- Persistent agents (CPO, CTO, etc.) run locally on each machine.
-- One row per (company, role, machine) — every machine gets its own instance.

CREATE TABLE public.persistent_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopped', 'error')),
  prompt_stack TEXT,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, machine_id)
);

-- RLS: users can read/write their own company's persistent agents
ALTER TABLE public.persistent_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company persistent agents"
  ON public.persistent_agents
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.user_companies
      WHERE user_id = auth.uid()
    )
  );
