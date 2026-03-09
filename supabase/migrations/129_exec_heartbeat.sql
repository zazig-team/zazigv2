ALTER TABLE roles ADD COLUMN cache_ttl_minutes INTEGER;
ALTER TABLE roles ADD COLUMN hard_ttl_minutes INTEGER DEFAULT 240;
ALTER TABLE roles ADD COLUMN heartbeat_md TEXT;

UPDATE roles
SET cache_ttl_minutes = 30, heartbeat_md = ''
WHERE name = 'cpo';

UPDATE roles
SET cache_ttl_minutes = 60, heartbeat_md = ''
WHERE name = 'cto';
