import type { SupabaseClient } from "@supabase/supabase-js";

interface CompanyProjectLookupRow {
  company_project: {
    repo_url: string | null;
  } | null;
}

/**
 * Resolves the company's canonical project repo URL via
 * companies.company_project_id -> projects.repo_url.
 */
export async function getCompanyProjectUrl(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("company_project:projects!companies_company_project_id_fkey(repo_url)")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve company project for company ${companyId}: ${error.message}`);
  }

  const row = (data as CompanyProjectLookupRow | null);
  return row?.company_project?.repo_url ?? null;
}
