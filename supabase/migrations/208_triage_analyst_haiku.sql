-- Switch triage-analyst to Haiku for faster triage (was claude-sonnet-4-6)
UPDATE expert_roles SET model = 'claude-haiku-4-5-20251001' WHERE name = 'triage-analyst';
