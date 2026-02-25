/**
 * company-picker.ts — prompts user to select a company if they belong to multiple.
 */

import { createInterface } from "node:readline/promises";

interface Company {
  id: string;
  name: string;
}

export async function fetchUserCompanies(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): Promise<Company[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_companies?select=company_id,companies(id,name)`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch companies: HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    company_id: string;
    companies: { id: string; name: string };
  }>;
  return rows.map((r) => ({ id: r.companies.id, name: r.companies.name }));
}

export async function pickCompany(companies: Company[]): Promise<Company> {
  if (companies.length === 0) {
    throw new Error("You don't belong to any companies. Run 'zazig setup' first.");
  }
  if (companies.length === 1) {
    return companies[0]!;
  }

  console.log("\nWhich company?\n");
  for (let i = 0; i < companies.length; i++) {
    console.log(`  ${i + 1}. ${companies[i]!.name}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`\nChoice [1]: `);
    const idx = (parseInt(ans.trim(), 10) || 1) - 1;
    if (idx < 0 || idx >= companies.length) {
      throw new Error("Invalid choice.");
    }
    return companies[idx]!;
  } finally {
    rl.close();
  }
}
