-- Migration 259: add error_message and error_details to jobs
-- Used by query-jobs edge function and CLI to display failure reasons.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_details TEXT;
