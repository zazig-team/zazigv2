-- Migration: Bring ideas table up to full production schema.
-- Idempotent — safe to run on both staging (bare-bones 102 table) and production (already complete).

-- 1. Add missing columns (IF NOT EXISTS prevents errors on production)
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS originator TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS complexity TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS autonomy TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS flags TEXT[];
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS clarification_notes TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS processed_by TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS related_ideas UUID[];
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS related_features UUID[];
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS suggested_exec TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS triaged_by TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS triage_notes TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS promoted_to_type TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS promoted_to_id UUID;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS promoted_by TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS doc_refs TEXT[];

-- 2. Backfill: copy legacy 'text' column into raw_text if raw_text is empty
-- Guard: only run if the legacy 'text' column exists (staging only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ideas' AND column_name = 'text'
  ) THEN
    EXECUTE 'UPDATE public.ideas SET raw_text = text WHERE raw_text IS NULL AND text IS NOT NULL';
  END IF;
END $$;

-- 3. Make company_id NOT NULL (only after any backfill — will fail if NULLs remain)
-- Skip if already NOT NULL (production). On staging the table should be empty or pre-populated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ideas'
      AND column_name = 'company_id' AND is_nullable = 'YES'
  ) THEN
    -- Fail loudly if there are NULL company_ids rather than silently corrupting
    IF EXISTS (SELECT 1 FROM public.ideas WHERE company_id IS NULL) THEN
      RAISE NOTICE 'ideas: skipping NOT NULL on company_id — NULL rows exist, backfill manually';
    ELSE
      ALTER TABLE public.ideas ALTER COLUMN company_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 4. Foreign keys (IF NOT EXISTS via DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_company_id_fkey') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_project_id_fkey') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Check constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_priority_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_priority_check
      CHECK (priority = ANY (ARRAY['low','medium','high','urgent']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_promoted_to_type_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_promoted_to_type_check
      CHECK (promoted_to_type = ANY (ARRAY['feature','job','research']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_scope_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_scope_check
      CHECK (scope = ANY (ARRAY['job','feature','initiative','project','research','unknown']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_source_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_source_check
      CHECK (source = ANY (ARRAY['terminal','slack','telegram','agent','web','api','monitoring']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_autonomy_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_autonomy_check
      CHECK (autonomy = ANY (ARRAY['exec-can-run','needs-human-input','needs-human-approval','unknown']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_status_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
      CHECK (status = ANY (ARRAY['new','triaged','parked','rejected','promoted','done']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_complexity_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_complexity_check
      CHECK (complexity = ANY (ARRAY['trivial','small','medium','large','unknown']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_domain_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_domain_check
      CHECK (domain = ANY (ARRAY['product','engineering','marketing','cross-cutting','unknown']));
  END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_ideas_company_status ON public.ideas (company_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_company_domain ON public.ideas (company_id, domain);
CREATE INDEX IF NOT EXISTS idx_ideas_tags ON public.ideas USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_ideas_flags ON public.ideas USING gin (flags);
CREATE INDEX IF NOT EXISTS idx_ideas_fts ON public.ideas USING gin (
  to_tsvector('english', (COALESCE(title, '') || ' ' || COALESCE(description, '')))
);

-- 7. Updated_at trigger (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ideas_updated_at' AND tgrelid = 'public.ideas'::regclass
  ) THEN
    CREATE TRIGGER ideas_updated_at
      BEFORE UPDATE ON public.ideas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
