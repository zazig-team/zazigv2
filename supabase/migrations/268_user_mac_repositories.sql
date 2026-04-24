-- 268_user_mac_repositories.sql
-- Per-user index of local Git repositories discovered by the Zazig Mac companion.
-- iOS reads this index during brownfield onboarding because it cannot browse
-- the Mac filesystem directly.

create table if not exists public.user_mac_repositories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_id       text not null,
  device_name     text,
  stable_id       text not null,
  display_name    text not null,
  local_path      text not null,
  remote_url      text,
  current_branch  text,
  is_dirty        boolean not null default false,
  last_commit_at  timestamptz,
  last_seen_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, device_id, stable_id)
);

create index if not exists user_mac_repositories_user_seen_idx
  on public.user_mac_repositories (user_id, last_seen_at desc);

create index if not exists user_mac_repositories_user_commit_idx
  on public.user_mac_repositories (user_id, last_commit_at desc nulls last);

create or replace function public.umr_touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end
$$ language plpgsql;

drop trigger if exists umr_touch_updated_at on public.user_mac_repositories;
create trigger umr_touch_updated_at
  before update on public.user_mac_repositories
  for each row execute function public.umr_touch_updated_at();

alter table public.user_mac_repositories enable row level security;

drop policy if exists "self reads mac repositories" on public.user_mac_repositories;
create policy "self reads mac repositories"
  on public.user_mac_repositories for select
  using (user_id = auth.uid());

drop policy if exists "self inserts mac repositories" on public.user_mac_repositories;
create policy "self inserts mac repositories"
  on public.user_mac_repositories for insert
  with check (user_id = auth.uid());

drop policy if exists "self updates mac repositories" on public.user_mac_repositories;
create policy "self updates mac repositories"
  on public.user_mac_repositories for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "self deletes mac repositories" on public.user_mac_repositories;
create policy "self deletes mac repositories"
  on public.user_mac_repositories for delete
  using (user_id = auth.uid());
