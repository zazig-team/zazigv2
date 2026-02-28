-- Migration: Create ideas table for capturing raw ideas from external sources (e.g. Telegram)

CREATE TABLE IF NOT EXISTS ideas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'telegram',
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by source
CREATE INDEX IF NOT EXISTS ideas_source_idx ON ideas (source);
CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas (created_at DESC);

-- RLS: disable by default (service role only)
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
