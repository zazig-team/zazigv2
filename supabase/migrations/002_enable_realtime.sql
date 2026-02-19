-- Enable Supabase Realtime for jobs and machines tables.
-- Local agents subscribe to changes on these tables via websocket channels.
-- The orchestrator watches jobs.status changes to track progress and release slots.
-- The local agent daemon watches machines for orchestrator commands.

ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
