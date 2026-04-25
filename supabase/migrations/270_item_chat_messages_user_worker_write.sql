-- 270_item_chat_messages_user_worker_write.sql
-- The Mac companion worker now authenticates with the signed-in user's
-- Supabase JWT. Migration 266 allowed those users to insert their own user
-- turns, but did not allow the worker to claim those rows or write replies.
--
-- Because the worker and UI share the same JWT, keep this deliberately narrow:
--   - authenticated users may only update worker-state fields on their own
--     user-turn rows, and only through known broker state transitions;
--   - authenticated users may insert assistant/lifecycle rows only for their
--     own companies and only when tied to an existing user parent row.

create or replace function public.icm_restrict_authenticated_worker_update()
returns trigger as $$
begin
  -- Service-role/admin paths bypass RLS but still run triggers; leave those
  -- unrestricted for SQL editor repairs and server-side jobs.
  if auth.uid() is null
     or current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if old.user_id is distinct from auth.uid()
     or new.user_id is distinct from auth.uid()
     or old.role <> 'user'
     or new.role <> 'user' then
    raise exception 'item_chat_messages user worker update denied';
  end if;

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.company_id is distinct from old.company_id
     or new.content is distinct from old.content
     or new.lifecycle_kind is distinct from old.lifecycle_kind
     or new.payload is distinct from old.payload
     or new.hermes_session_id is distinct from old.hermes_session_id
     or new.parent_message_id is distinct from old.parent_message_id
     or new.client_msg_id is distinct from old.client_msg_id
     or new.created_at is distinct from old.created_at then
    raise exception 'item_chat_messages immutable fields cannot be changed by user worker';
  end if;

  if old.status = 'pending'
     and new.status = 'processing'
     and old.claim_token is null
     and new.claim_token is not null
     and old.claimed_at is null
     and new.claimed_at is not null
     and new.error_message is null then
    return new;
  end if;

  if old.status = 'processing'
     and new.status = 'done'
     and new.claim_token is null
     and new.claimed_at is not null
     and new.error_message is null then
    return new;
  end if;

  if old.status = 'processing'
     and new.status = 'error'
     and new.claim_token is null
     and new.claimed_at is not null
     and new.error_message is not null then
    return new;
  end if;

  if old.status = 'processing'
     and new.status = 'pending'
     and new.claim_token is null
     and new.claimed_at is null
     and new.error_message is not distinct from old.error_message then
    return new;
  end if;

  raise exception 'item_chat_messages invalid user worker state transition';
end;
$$ language plpgsql;

drop trigger if exists icm_restrict_authenticated_worker_update on public.item_chat_messages;
create trigger icm_restrict_authenticated_worker_update
  before update on public.item_chat_messages
  for each row execute function public.icm_restrict_authenticated_worker_update();

drop policy if exists "members update own user turn worker state" on public.item_chat_messages;
create policy "members update own user turn worker state"
  on public.item_chat_messages for update
  using (
    role = 'user'
    and user_id = auth.uid()
    and company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  )
  with check (
    role = 'user'
    and user_id = auth.uid()
    and company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
  );

drop policy if exists "members insert worker replies" on public.item_chat_messages;
create policy "members insert worker replies"
  on public.item_chat_messages for insert
  with check (
    user_id = auth.uid()
    and status = 'done'
    and claim_token is null
    and claimed_at is null
    and error_message is null
    and client_msg_id is null
    and parent_message_id is not null
    and company_id in (
      select uc.company_id from public.user_companies uc where uc.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.item_chat_messages parent
      where parent.id = parent_message_id
        and parent.user_id = auth.uid()
        and parent.company_id = item_chat_messages.company_id
        and parent.conversation_id = item_chat_messages.conversation_id
        and parent.role = 'user'
        and (
          (item_chat_messages.role = 'assistant' and parent.status = 'processing')
          or (item_chat_messages.role = 'lifecycle' and parent.status in ('processing', 'done'))
        )
    )
    and (
      (
        role = 'assistant'
        and content is not null
        and content <> ''
        and lifecycle_kind is null
        and payload is null
        and hermes_session_id is not null
      )
      or (
        role = 'lifecycle'
        and content is null
        and lifecycle_kind is not null
        and payload is not null
        and hermes_session_id is null
      )
    )
  );
