-- Fix copy-paste bug: CTO Output Contract pointed to cpo-report.md
UPDATE public.roles SET
  prompt = regexp_replace(
    prompt,
    'Every job ends with \.claude/cpo-report\.md\.',
    'Every job ends with .claude/cto-report.md.',
    'g'
  )
WHERE name = 'cto';
