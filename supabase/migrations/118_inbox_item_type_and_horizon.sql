ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'idea'
    CHECK (item_type IN ('idea', 'brief', 'bug', 'test'));

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS horizon TEXT
    CHECK (horizon IN ('soon', 'later'));

CREATE INDEX IF NOT EXISTS idx_ideas_company_item_type
  ON public.ideas (company_id, item_type);
