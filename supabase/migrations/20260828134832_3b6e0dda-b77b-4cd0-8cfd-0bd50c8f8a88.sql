create table if not exists public.whatsapp_group_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  group_jid text,
  group_name text,
  phone text not null,
  name text,
  is_admin_member boolean not null default false,
  source text not null default 'evolution',
  created_at timestamptz not null default now(),
  unique (user_id, group_jid, phone)
);
grant select, insert, update, delete on public.whatsapp_group_contacts to authenticated;
grant all on public.whatsapp_group_contacts to service_role;
alter table public.whatsapp_group_contacts enable row level security;
create policy "Admins manage group contacts" on public.whatsapp_group_contacts
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create index if not exists idx_wgc_user_group on public.whatsapp_group_contacts(user_id, group_jid);

create table if not exists public.whatsapp_extract_tokens (
  user_id uuid primary key,
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.whatsapp_extract_tokens to authenticated;
grant all on public.whatsapp_extract_tokens to service_role;
alter table public.whatsapp_extract_tokens enable row level security;
create policy "Admins manage extract tokens" on public.whatsapp_extract_tokens
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));