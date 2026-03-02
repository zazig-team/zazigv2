-- Add enabled flag to machines so operators can remotely disable a machine
-- without the heartbeat overriding it (heartbeat only touches status/last_heartbeat).
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
