-- 024_setup_insert_policies.sql
-- Adds INSERT policies for authenticated users on companies and projects.
-- Required for `zazig setup` — users create their own company and projects
-- using a user auth token (not service role key).

-- Allow authenticated users to create companies.
-- Any authenticated user can create a company (they're bootstrapping).
-- Future: consider restricting to invite-only or adding an owner_id column.
CREATE POLICY "authenticated_insert_company"
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to create projects in companies they belong to.
-- Scoped by JWT company_id claim so users can only add projects to their own company.
CREATE POLICY "authenticated_insert_own_project"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );
