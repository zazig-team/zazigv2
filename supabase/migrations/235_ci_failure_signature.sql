ALTER TABLE features ADD COLUMN ci_failure_signature TEXT;
CREATE INDEX idx_features_ci_failure_signature ON features(ci_failure_signature) WHERE ci_failure_signature IS NOT NULL;
