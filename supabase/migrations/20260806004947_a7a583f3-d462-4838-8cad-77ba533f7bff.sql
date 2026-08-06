
create extension if not exists pg_trgm;

create table public.whatsapp_utility_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  base_name text not null,
  business_purpose text not null,
  trigger_event text not null,
  utility_risk text not null check (utility_risk in ('low', 'medium', 'high', 'LOW', 'MEDIUM', 'HIGH')),
  language text default 'pt-br',
  context jsonb not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  final_outcome text check (final_outcome in ('SUCCESS', 'FAIL_RECATEGORIZED', 'FAIL_REJECTED', 'FAIL_TIMEOUT', 'HARD_STOP')),
  created_at timestamptz not null default now()
);

create index whatsapp_utility_sessions_purpose_trgm on public.whatsapp_utility_sessions using gin (business_purpose gin_trgm_ops);
create index whatsapp_utility_sessions_trigger_trgm on public.whatsapp_utility_sessions using gin (trigger_event gin_trgm_ops);
create index whatsapp_utility_sessions_user_idx on public.whatsapp_utility_sessions (user_id);

create table public.whatsapp_utility_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.whatsapp_utility_sessions(id) on delete cascade,
  attempt_no int not null,
  template_name text not null,
  template_id text,
  body text not null,
  strictness_level int not null,
  submitted_at timestamptz not null default now(),
  evaluated_at timestamptz,
  status text, -- APPROVED / REJECTED / PENDING
  category text, -- UTILITY / MARKETING / AUTHENTICATION
  previous_category text,
  outcome text, -- SUCCESS / FAIL_RECATEGORIZED / FAIL_REJECTED / FAIL_TIMEOUT
  rejection_reason text,
  unique (session_id, attempt_no)
);

create table public.whatsapp_utility_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  summarized_at timestamptz not null default now(),
  session_count int not null,
  clusters jsonb not null,
  anti_patterns jsonb not null
);

create index whatsapp_utility_summary_user_idx on public.whatsapp_utility_summary (user_id);

-- RLS
alter table public.whatsapp_utility_sessions enable row level security;
alter table public.whatsapp_utility_attempts enable row level security;
alter table public.whatsapp_utility_summary enable row level security;

grant select, insert, update, delete on public.whatsapp_utility_sessions to authenticated;
grant select, insert, update, delete on public.whatsapp_utility_attempts to authenticated;
grant select, insert, update, delete on public.whatsapp_utility_summary to authenticated;

grant all on public.whatsapp_utility_sessions to service_role;
grant all on public.whatsapp_utility_attempts to service_role;
grant all on public.whatsapp_utility_summary to service_role;

create policy "Users can manage their own sessions" on public.whatsapp_utility_sessions
  for all to authenticated using (auth.uid() = user_id);

create policy "Users can manage their own attempts" on public.whatsapp_utility_attempts
  for all to authenticated using (
    exists (
      select 1 from public.whatsapp_utility_sessions
      where id = whatsapp_utility_attempts.session_id and user_id = auth.uid()
    )
  );

create policy "Users can manage their own summary" on public.whatsapp_utility_summary
  for all to authenticated using (auth.uid() = user_id);
