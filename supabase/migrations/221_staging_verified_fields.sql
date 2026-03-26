ALTER TABLE features
  ADD COLUMN staging_verified_by text DEFAULT NULL,
  ADD COLUMN staging_verified_at timestamptz DEFAULT NULL;
