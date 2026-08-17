
CREATE TABLE public.sigma_bridge_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    sigma_connection_id uuid references public.sigma_panel_connections(id) on delete cascade not null,
    action text not null,
    payload jsonb default '{}'::jsonb,
    status text not null default 'pending',
    response_payload jsonb,
    error_message text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    expires_at timestamptz default (now() + interval '5 minutes'),
    processed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigma_bridge_jobs TO authenticated;
GRANT ALL ON public.sigma_bridge_jobs TO service_role;

ALTER TABLE public.sigma_bridge_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sigma bridge jobs"
ON public.sigma_bridge_jobs
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

ALTER TABLE public.sigma_panel_connections ADD COLUMN IF NOT EXISTS bridge_token text;
ALTER TABLE public.sigma_panel_connections ADD COLUMN IF NOT EXISTS last_bridge_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_sigma_bridge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_sigma_bridge_job_updated
    BEFORE UPDATE ON public.sigma_bridge_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_sigma_bridge_updated_at();
