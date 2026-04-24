-- 266_item_chat_messages.sql
-- Supabase-mediated chat between iOS clients and each user's Zazig Mac companion.
-- One row per turn (user / assistant / lifecycle). Decoupled from public.ideas:
-- conversation_id is device-owned so chats work before any v2 pipeline handoff.

create table if not exists public.item_chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null,                 -- == Item.sessionId on device
  user_id            uuid not null references auth.users(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  role               text not null check (role in ('user','assistant','system','lifecycle')),
  content            text,                          -- null for lifecycle-only rows
  lifecycle_kind     text check (lifecycle_kind in
                       ('classified','retitled','thinking','tool_use','done','error')),
  payload            jsonb,                         -- for lifecycle rows (e.g. classification result)
  hermes_session_id  text,                          -- worker-set; == conversation_id today
  parent_message_id  uuid references public.item_chat_messages(id) on delete set null,
  status             text not null default 'pending'
                       check (status in ('pending','processing','done','error')),
  claim_token        text,
  claimed_at         timestamptz,
  error_message      text,
  client_msg_id      uuid,                          -- idempotency token from device
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists item_chat_messages_conversation_created_idx
  on public.item_chat_messages (conversation_id, created_at);
create index if not exists item_chat_messages_pending_idx
  on public.item_chat_messages (status, created_at) where status = 'pending';
create index if not exists item_chat_messages_stale_claims_idx
  on public.item_chat_messages (status, claimed_at) where status = 'processing';
create unique index if not exists item_chat_messages_client_msg_id_idx
  on public.item_chat_messages (client_msg_id) where client_msg_id is not null;

-- updated_at trigger
create or replace function public.icm_touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end
$$ language plpgsql;

drop trigger if exists icm_touch_updated_at on public.item_chat_messages;
create trigger icm_touch_updated_at
  before update on public.item_chat_messages
  for each row execute function public.icm_touch_updated_at();

alter table public.item_chat_messages enable row level security;

-- SELECT: members of the row's company can read it.
drop policy if exists "members read item_chat_messages" on public.item_chat_messages;
create policy "members read item_chat_messages"
  on public.item_chat_messages for select
  using (
    company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  );

-- INSERT: device can insert ONLY its own user turns in pending state.
-- No forging assistant rows. No pre-setting worker-managed fields.
-- Production worker uses a bot user / service role; service-role bypasses RLS.
drop policy if exists "members insert user turns" on public.item_chat_messages;
create policy "members insert user turns"
  on public.item_chat_messages for insert
  with check (
    role = 'user'
    and status = 'pending'
    and user_id = auth.uid()
    and hermes_session_id is null
    and claim_token is null
    and claimed_at is null
    and error_message is null
    and lifecycle_kind is null
    and company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  );

-- Realtime publication (guarded so re-apply is safe)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_chat_messages'
  ) then
    alter publication supabase_realtime add table public.item_chat_messages;
  end if;
end $$;

alter table public.item_chat_messages replica identity full;
