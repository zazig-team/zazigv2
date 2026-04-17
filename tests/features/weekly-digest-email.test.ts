/**
 * Feature: Weekly Digest Email
 *
 * Tests encode acceptance criteria for:
 * 1. A send-weekly-digest Supabase edge function exists
 * 2. The function queries features completed in the past 7 days
 * 3. The function sends emails to company stakeholders via an email provider
 * 4. Email content includes shipped feature titles
 * 5. The function has a deno.json configuration
 * 6. A scheduled cron migration triggers the digest weekly
 * 7. The function returns a structured JSON response with send count
 * 8. The function handles empty weeks gracefully (no features = no email sent)
 *
 * Written to FAIL against the current codebase — passes once the feature is built.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relPath: string): string | null {
  const fullPath = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function getMigrationFiles(): string[] {
  const dir = path.join(REPO_ROOT, 'supabase/migrations');
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AC1: send-weekly-digest edge function exists
// ---------------------------------------------------------------------------

describe('send-weekly-digest edge function — exists', () => {
  const FUNCTION_DIR = 'supabase/functions/send-weekly-digest';
  const FUNCTION_FILE = `${FUNCTION_DIR}/index.ts`;
  const DENO_JSON_FILE = `${FUNCTION_DIR}/deno.json`;
  let content: string | null;
  let denoJson: string | null;

  beforeAll(() => {
    content = readRepoFile(FUNCTION_FILE);
    denoJson = readRepoFile(DENO_JSON_FILE);
  });

  it('send-weekly-digest/index.ts exists', () => {
    expect(content, `${FUNCTION_FILE} not found — create the weekly digest edge function`).not.toBeNull();
  });

  it('send-weekly-digest/deno.json exists', () => {
    expect(denoJson, `${DENO_JSON_FILE} not found — create deno.json for the edge function`).not.toBeNull();
  });

  it('imports createClient from @supabase/supabase-js', () => {
    expect(content).toMatch(/createClient.*@supabase\/supabase-js|@supabase\/supabase-js.*createClient/);
  });

  it('reads SUPABASE_URL from environment', () => {
    expect(content).toMatch(/SUPABASE_URL/);
  });

  it('reads SUPABASE_SERVICE_ROLE_KEY from environment', () => {
    expect(content).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('exports a Deno.serve handler', () => {
    expect(content).toMatch(/Deno\.serve/);
  });
});

// ---------------------------------------------------------------------------
// AC2: queries features completed in the past 7 days
// ---------------------------------------------------------------------------

describe('send-weekly-digest — queries recently completed features', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('queries the features table', () => {
    expect(content).toMatch(/from\(\s*['"]features['"]\s*\)|\.from\('features'\)|\.from\("features"\)/);
  });

  it('filters by status = complete', () => {
    expect(content).toMatch(/status.*complete|complete.*status/i);
  });

  it('filters features updated or created within the past 7 days', () => {
    // Should reference a 7-day window
    expect(content).toMatch(/7\s*\*\s*24|7\s*days|7d|168\s*\*\s*60|week/i);
  });

  it('selects feature title in the query', () => {
    expect(content).toMatch(/title/);
  });
});

// ---------------------------------------------------------------------------
// AC3: sends emails to company stakeholders
// ---------------------------------------------------------------------------

describe('send-weekly-digest — sends emails via an email provider', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('uses an email provider (Resend, SendGrid, or SMTP)', () => {
    expect(content).toMatch(/resend\.com|sendgrid|smtp|RESEND_API_KEY|SENDGRID_API_KEY|nodemailer|email.*send|send.*email/i);
  });

  it('reads email API key from environment variables', () => {
    expect(content).toMatch(/RESEND_API_KEY|SENDGRID_API_KEY|EMAIL_API_KEY|SMTP_/i);
  });

  it('sets a From address for outgoing emails', () => {
    expect(content).toMatch(/from.*@|From.*:/i);
  });

  it('sends to company stakeholder email addresses', () => {
    // Should query users/profiles or accept an email list
    expect(content).toMatch(/email|to:/i);
  });
});

// ---------------------------------------------------------------------------
// AC4: email content includes shipped feature titles
// ---------------------------------------------------------------------------

describe('send-weekly-digest — email body includes feature summaries', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('includes a subject line for the weekly digest email', () => {
    expect(content).toMatch(/subject.*weekly|subject.*digest|Weekly Digest|weekly digest/i);
  });

  it('builds an HTML or text body that references feature titles', () => {
    // The template should iterate over features and include their titles
    expect(content).toMatch(/title|\.title/);
    // And generate an html or text body string
    expect(content).toMatch(/html|body|text/i);
  });

  it('includes feature count or list in the email body', () => {
    expect(content).toMatch(/features?\.length|features?\.map|for.*feature|shipped/i);
  });
});

// ---------------------------------------------------------------------------
// AC5: handles empty weeks gracefully
// ---------------------------------------------------------------------------

describe('send-weekly-digest — empty week handling', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('does not send email when no features were completed that week', () => {
    // Should have a guard that skips sending when features list is empty
    expect(content).toMatch(/length.*===.*0|length.*==.*0|\.length\s*<\s*1|features\.length.*return|!features\.length|features\.length.*0/i);
  });

  it('returns a structured response indicating zero emails sent on empty weeks', () => {
    expect(content).toMatch(/sent.*0|0.*sent|skipped|no.*features|emails_sent/i);
  });
});

// ---------------------------------------------------------------------------
// AC6: returns structured JSON response
// ---------------------------------------------------------------------------

describe('send-weekly-digest — structured JSON response', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('returns JSON content-type', () => {
    expect(content).toMatch(/application\/json/);
  });

  it('response includes emails_sent or sent count', () => {
    expect(content).toMatch(/emails_sent|sent_count|emailsSent|sentCount|emails.*sent/i);
  });

  it('returns 200 status on success', () => {
    expect(content).toMatch(/status.*200|200.*status|new Response.*200/);
  });
});

// ---------------------------------------------------------------------------
// AC7: scheduled cron trigger via migration
// ---------------------------------------------------------------------------

describe('Weekly digest — scheduled cron trigger', () => {
  let digestMigrationContent: string | null = null;
  let digestMigrationFile: string | null = null;

  beforeAll(() => {
    const files = getMigrationFiles();
    // Find migration that references weekly digest or cron for digest
    for (const f of files) {
      const c = readRepoFile(`supabase/migrations/${f}`);
      if (c && (c.toLowerCase().includes('weekly_digest') || c.toLowerCase().includes('weekly-digest') || (c.toLowerCase().includes('digest') && c.toLowerCase().includes('cron')))) {
        digestMigrationFile = `supabase/migrations/${f}`;
        digestMigrationContent = c;
        break;
      }
    }
  });

  it('a migration exists that schedules the weekly digest', () => {
    expect(
      digestMigrationContent,
      'No migration found that schedules the weekly digest. Create a migration with pg_cron or similar.',
    ).not.toBeNull();
  });

  it('schedules the digest on a weekly cadence (Monday or similar)', () => {
    // pg_cron weekly schedule: "0 9 * * 1" (Monday 9am) or similar
    expect(digestMigrationContent).toMatch(/cron\.|pg_cron|schedule.*weekly|weekly.*schedule|0.*\*.*\*.*[0-9]|monday/i);
  });

  it('calls the send-weekly-digest edge function or HTTP endpoint', () => {
    expect(digestMigrationContent).toMatch(/send.weekly.digest|weekly.digest|net\.http_post|supabase.*functions/i);
  });
});

// ---------------------------------------------------------------------------
// AC8: accepts company_id parameter to scope the digest
// ---------------------------------------------------------------------------

describe('send-weekly-digest — company scoping', () => {
  const FILE = 'supabase/functions/send-weekly-digest/index.ts';
  let content: string | null;

  beforeAll(() => {
    content = readRepoFile(FILE);
  });

  it('accepts company_id as a query parameter or request body field', () => {
    expect(content).toMatch(/company_id/);
  });

  it('scopes the features query to the given company_id', () => {
    // Query should filter by company_id
    expect(content).toMatch(/company_id/);
    expect(content).toMatch(/\.eq\(.*company_id|company_id.*\.eq/);
  });
});
