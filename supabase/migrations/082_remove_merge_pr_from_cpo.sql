-- Remove merge_pr from CPO — no GitHub access on the backend
UPDATE public.roles
SET mcp_tools = array_remove(mcp_tools, 'merge_pr')
WHERE name = 'cpo';
