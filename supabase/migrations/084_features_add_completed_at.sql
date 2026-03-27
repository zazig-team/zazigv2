-- Add completed_at timestamp to features table
ALTER TABLE features ADD COLUMN IF NOT EXISTS completed_at timestamptz;
