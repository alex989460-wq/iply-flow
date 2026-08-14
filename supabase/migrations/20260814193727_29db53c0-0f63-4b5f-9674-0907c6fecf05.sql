ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS koffice_connection_id uuid REFERENCES public.koffice_panel_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS servers_koffice_connection_id_idx ON public.servers (koffice_connection_id);