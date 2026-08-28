drop policy if exists "Admins manage group contacts" on public.whatsapp_group_contacts;
drop policy if exists "Admins manage extract tokens" on public.whatsapp_extract_tokens;
create policy "Users manage own group contacts" on public.whatsapp_group_contacts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own extract token" on public.whatsapp_extract_tokens
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);