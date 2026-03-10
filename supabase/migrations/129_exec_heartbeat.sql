ALTER TABLE roles ADD COLUMN IF NOT EXISTS cache_ttl_minutes INTEGER;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS hard_ttl_minutes INTEGER DEFAULT 240;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS heartbeat_md TEXT;

UPDATE roles
SET cache_ttl_minutes = 30, heartbeat_md = ''
WHERE name = 'cpo';

UPDATE roles
SET cache_ttl_minutes = 60, heartbeat_md = ''
WHERE name = 'cto';
