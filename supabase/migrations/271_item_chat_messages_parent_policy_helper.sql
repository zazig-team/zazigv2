-- 271_item_chat_messages_parent_policy_helper.sql
-- Fix policy recursion from 270. Postgres rejects policies that query the
-- same table being protected, so keep the parent-row validation in a narrow
-- security-definer helper and call that from the insert policy.

create or replace function public.icm_valid_worker_reply_parent(
  p_parent_message_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_conversation_id uuid,
  p_child_role text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.item_chat_messages parent
    where parent.id = p_parent_message_id
      and parent.user_id = p_user_id
      and parent.company_id = p_company_id
      and parent.conversation_id = p_conversation_id
      and parent.role = 'user'
      and (
        (p_child_role = 'assistant' and parent.status = 'processing')
        or (p_child_role = 'lifecycle' and parent.status in ('processing', 'done'))
      )
  );
$$;

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
    and public.icm_valid_worker_reply_parent(
      parent_message_id,
      auth.uid(),
      company_id,
      conversation_id,
      role
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
