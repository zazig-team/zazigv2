-- Remove staging verification columns added in 218_staging_verification_fields.
-- These columns were added in error and are not part of the intended schema.
ALTER TABLE features
  DROP COLUMN IF EXISTS staging_verified_by,
  DROP COLUMN IF EXISTS staging_verified_at;
