-- Add priority column to features table for featurify/CPO workflow
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IN ('low', 'medium', 'high'))
    DEFAULT 'medium';
