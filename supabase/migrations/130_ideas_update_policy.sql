-- Allow authenticated users to update ideas in their own company
CREATE POLICY "authenticated_update_own"
  ON public.ideas
  FOR UPDATE
  TO authenticated
  USING (user_in_company(company_id))
  WITH CHECK (user_in_company(company_id));
