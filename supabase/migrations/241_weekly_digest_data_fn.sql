-- 241_weekly_digest_data_fn.sql
-- Adds a helper function for weekly digest email payload generation.
-- The weekly pg_cron schedule is defined in 242_weekly_digest_cron.sql
-- (cron.schedule on Monday cadence), which calls send-weekly-digest
-- via net.http_post.

CREATE OR REPLACE FUNCTION public.get_weekly_digest_data(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - INTERVAL '7 days';
BEGIN
  RETURN (
    WITH completed_features AS (
      SELECT
        f.id,
        f.title,
        f.promoted_version,
        f.updated_at
      FROM public.features f
      WHERE f.company_id = p_company_id
        AND f.status = 'complete'
        AND f.updated_at >= v_window_start
    ),
    failed_jobs_recent AS (
      SELECT
        j.id,
        j.title,
        feat.title AS feature_title,
        j.updated_at
      FROM public.jobs j
      LEFT JOIN public.features feat ON feat.id = j.feature_id
      WHERE j.company_id = p_company_id
        AND j.status = 'failed'
        AND j.updated_at >= v_window_start
    ),
    owner_email AS (
      SELECT u.email
      FROM auth.users u
      JOIN public.company_members cm ON cm.user_id = u.id
      WHERE cm.company_id = p_company_id
        AND cm.role = 'owner'
      LIMIT 1
    )
    SELECT jsonb_build_object(
      'shipped_features', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', cf.id,
              'title', cf.title,
              'promoted_version', cf.promoted_version
            )
            ORDER BY cf.updated_at DESC
          )
          FROM completed_features cf
        ),
        '[]'::jsonb
      ),
      'merged_pr_count', (
        SELECT COUNT(*)::INT
        FROM completed_features
      ),
      'failed_jobs', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', fj.id,
              'title', fj.title,
              'feature_title', fj.feature_title
            )
            ORDER BY fj.updated_at DESC
          )
          FROM failed_jobs_recent fj
        ),
        '[]'::jsonb
      ),
      'founder_email', (
        SELECT email
        FROM owner_email
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_digest_data(UUID) TO service_role;
