ALTER TABLE features
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_history jsonb NOT NULL DEFAULT '[]'::jsonb;
