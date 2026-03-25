-- Add pr_ready status to feature lifecycle + pr_url column on features
-- Also grant CPO the merge_pr tool

-- 1. Add pr_ready to the feature status constraint
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'created',
  'ready_for_breakdown',
  'breakdown',
  'building',
  'combining',
  'verifying',
  'pr_ready',
  'deploying_to_test',
  'ready_to_test',
  'deploying_to_prod',
  'complete',
  'cancelled',
  'failed'
));

-- 2. Add pr_url column to features table (stores the GitHub PR URL)
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS pr_url text;

-- 3. Grant CPO merge_pr + send_message tools
UPDATE public.roles
SET mcp_tools = '{query_projects,create_feature,update_feature,request_work,merge_pr,send_message}'
WHERE name = 'cpo';
