-- Add staging verification fields to features table.
-- staging_verified_by: name of the person who verified the feature on staging
-- staging_verified_at: timestamp when verification was recorded
ALTER TABLE features
  ADD COLUMN staging_verified_by text DEFAULT NULL,
  ADD COLUMN staging_verified_at timestamptz DEFAULT NULL;
