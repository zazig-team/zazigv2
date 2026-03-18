CREATE TABLE IF NOT EXISTS public.idea_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  promoted_to_type TEXT NOT NULL CHECK (promoted_to_type IN ('feature', 'job', 'research', 'capability')),
  promoted_to_id UUID,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_by TEXT,
  UNIQUE(idea_id, promoted_to_type, promoted_to_id)
);

ALTER TABLE public.idea_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on idea_promotions"
  ON public.idea_promotions FOR ALL
  USING (true) WITH CHECK (true);
