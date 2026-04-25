-- 269_user_mac_sessions_self_write.sql
-- The Mac companion now authenticates with the signed-in user's Supabase JWT,
-- not a service-role key. Allow it to maintain only its own liveness row.

drop policy if exists "self inserts mac session" on public.user_mac_sessions;
create policy "self inserts mac session"
  on public.user_mac_sessions for insert
  with check (user_id = auth.uid());

drop policy if exists "self updates mac session" on public.user_mac_sessions;
create policy "self updates mac session"
  on public.user_mac_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
