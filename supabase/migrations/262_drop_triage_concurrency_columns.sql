-- 262_drop_triage_concurrency_columns.sql
-- Remove unused triage concurrency settings from companies table.
-- Slot capacity on the local agent handles concurrency naturally.

ALTER TABLE companies DROP COLUMN IF EXISTS triage_max_concurrent;
ALTER TABLE companies DROP COLUMN IF EXISTS triage_batch_size;
ALTER TABLE companies DROP COLUMN IF EXISTS triage_delay_minutes;
