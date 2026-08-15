CREATE TABLE public.panel_stats_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  panel text,
  credits numeric,
  online integer,
  error text,
  updated_at timestamptz not null default now(),
  unique (user_id, server_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.panel_stats_cache TO authenticated;
GRANT ALL ON public.panel_stats_cache TO service_role;
ALTER TABLE public.panel_stats_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own panel stats" ON public.panel_stats_cache FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());