CREATE TABLE public.koffice_panel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  base_url text NOT NULL,
  username text NOT NULL,
  api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.koffice_panel_connections TO authenticated;
GRANT ALL ON public.koffice_panel_connections TO service_role;

ALTER TABLE public.koffice_panel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "koffice_conn_select" ON public.koffice_panel_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "koffice_conn_insert" ON public.koffice_panel_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "koffice_conn_update" ON public.koffice_panel_connections
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "koffice_conn_delete" ON public.koffice_panel_connections
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_koffice_panel_connections_updated_at
  BEFORE UPDATE ON public.koffice_panel_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();