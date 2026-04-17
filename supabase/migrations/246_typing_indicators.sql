-- Migration: typing_indicators table
-- Tracks active typing state per job conversation participant.

CREATE TABLE IF NOT EXISTS typing_indicators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('agent', 'user')),
  typed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS typing_indicators_job_id_idx ON typing_indicators (job_id);

-- Enable RLS
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users can read typing indicators for their company's jobs
CREATE POLICY "authenticated can read typing_indicators"
  ON typing_indicators FOR SELECT
  TO authenticated
  USING (true);

-- RLS policy: authenticated users can upsert their own typing indicators
CREATE POLICY "authenticated can upsert typing_indicators"
  ON typing_indicators FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update typing_indicators"
  ON typing_indicators FOR UPDATE
  TO authenticated
  USING (true);

-- Add typing_indicators to Supabase Realtime publication so subscribers get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE typing_indicators;
