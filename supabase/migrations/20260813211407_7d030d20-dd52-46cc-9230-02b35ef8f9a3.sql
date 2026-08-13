ALTER TABLE public.servers
ADD COLUMN sigma_connection_id uuid NULL REFERENCES public.sigma_panel_connections(id) ON DELETE SET NULL;

CREATE INDEX idx_servers_sigma_connection_id ON public.servers(sigma_connection_id);