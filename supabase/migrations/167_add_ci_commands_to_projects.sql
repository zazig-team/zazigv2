ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS test_command text,
    ADD COLUMN IF NOT EXISTS build_command text;

UPDATE public.projects
SET
    test_command = 'npm test',
    build_command = 'npm run build'
WHERE name = 'zazigv2';

UPDATE public.projects
SET
    test_command = 'npm test',
    build_command = 'npm run build'
WHERE name = 'staging-website';
