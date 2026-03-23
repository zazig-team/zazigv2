-- 200: Widen jobs.title from VARCHAR(120) to TEXT
-- VARCHAR(120) was too short for feature titles like
-- "CLI Stage 2: Write commands — create-feature, update-feature, create-idea, update-idea, promote-idea, create-rule"
-- which caused triggerMerging to fail with "value too long for type character varying(120)"

ALTER TABLE public.jobs ALTER COLUMN title TYPE TEXT;
