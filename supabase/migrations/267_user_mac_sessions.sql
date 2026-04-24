-- 267_user_mac_sessions.sql
-- Liveness heartbeat for each user's paired Zazig Mac companion.
-- One row per user; worker upserts last_seen_at every ~15s.
-- iOS subscribes so the UI can show "your Mac is offline" when heartbeats stop.

create table if not exists public.user_mac_sessions (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  device_id       text not null,
  device_name     text,
  worker_version  text,
  last_seen_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists user_mac_sessions_last_seen_idx
  on public.user_mac_sessions (last_seen_at desc);

-- updated_at trigger
create or replace function public.ums_touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end
$$ language plpgsql;

drop trigger if exists ums_touch_updated_at on public.user_mac_sessions;
create trigger ums_touch_updated_at
  before update on public.user_mac_sessions
  for each row execute function public.ums_touch_updated_at();

alter table public.user_mac_sessions enable row level security;

-- SELECT: users can read their own liveness row.
drop policy if exists "self reads mac session" on public.user_mac_sessions;
create policy "self reads mac session"
  on public.user_mac_sessions for select
  using (user_id = auth.uid());

-- Production worker writes via service role (bypasses RLS); no client write policy.

-- Realtime publication (guarded so re-apply is safe)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_mac_sessions'
  ) then
    alter publication supabase_realtime add table public.user_mac_sessions;
  end if;
end $$;

alter table public.user_mac_sessions replica identity full;
