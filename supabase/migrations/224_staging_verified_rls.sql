-- Narrow browser-side feature verification updates to staging verification fields only.

-- Ensure browser roles cannot update arbitrary feature columns.
REVOKE UPDATE ON public.features FROM anon, authenticated;

-- Allow browser roles to update only staging verification columns.
GRANT UPDATE (staging_verified_by, staging_verified_at) ON public.features TO anon, authenticated;

-- Company-scoped UPDATE policy for staging verification writes.
DROP POLICY IF EXISTS "webui_staging_verified_update_own_company" ON public.features;
CREATE POLICY "webui_staging_verified_update_own_company"
ON public.features
FOR UPDATE
TO anon, authenticated
USING (public.user_in_company(company_id))
WITH CHECK (public.user_in_company(company_id));
