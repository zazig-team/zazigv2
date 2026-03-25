-- Migration: Bring features table up to full production schema.
-- Idempotent — safe to run on both staging and production.

-- 1. Add missing columns
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS acceptance_tests TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS human_checklist TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS test_url VARCHAR(500);
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS test_started_at TIMESTAMPTZ;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS slack_channel VARCHAR(100);
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS slack_thread_ts VARCHAR(50);
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS testing_machine_id TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS verification_type TEXT NOT NULL DEFAULT 'passive';
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS fast_track BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS pr_url TEXT;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS doc_refs TEXT[];
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS source_idea_id UUID;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 2. Make company_id / project_id NOT NULL if safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'features'
      AND column_name = 'company_id' AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.features WHERE company_id IS NULL) THEN
      RAISE NOTICE 'features: skipping NOT NULL on company_id — NULL rows exist';
    ELSE
      ALTER TABLE public.features ALTER COLUMN company_id SET NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'features'
      AND column_name = 'project_id' AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.features WHERE project_id IS NULL) THEN
      RAISE NOTICE 'features: skipping NOT NULL on project_id — NULL rows exist';
    ELSE
      ALTER TABLE public.features ALTER COLUMN project_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 3. Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_company_id_fkey') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_source_idea_id_fkey') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_source_idea_id_fkey
      FOREIGN KEY (source_idea_id) REFERENCES public.ideas (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_features_company_id') THEN
    ALTER TABLE public.features ADD CONSTRAINT uq_features_company_id UNIQUE (id, company_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_project_id_company_id_fkey') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_project_id_company_id_fkey
      FOREIGN KEY (project_id, company_id) REFERENCES public.projects (id, company_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Check constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_status_check') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_status_check
      CHECK (status = ANY (ARRAY[
        'created','ready_for_breakdown','breakdown','building',
        'combining','combining_and_pr','verifying','merging',
        'pr_ready','deploying_to_test','ready_to_test','deploying_to_prod',
        'complete','cancelled','failed'
      ]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_verification_type_check') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_verification_type_check
      CHECK (verification_type = ANY (ARRAY['passive','active']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'features_priority_check') THEN
    ALTER TABLE public.features ADD CONSTRAINT features_priority_check
      CHECK (priority = ANY (ARRAY['low','medium','high']));
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_features_tags ON public.features USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_features_company_id ON public.features (company_id);
CREATE INDEX IF NOT EXISTS idx_features_project_id ON public.features (project_id);
CREATE INDEX IF NOT EXISTS features_slack_thread_idx ON public.features (slack_channel, slack_thread_ts)
  WHERE slack_channel IS NOT NULL AND slack_thread_ts IS NOT NULL;

-- 6. Updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'features_updated_at' AND tgrelid = 'public.features'::regclass
  ) THEN
    CREATE TRIGGER features_updated_at
      BEFORE UPDATE ON public.features
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
