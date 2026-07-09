
CREATE TABLE public.activation_panel_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  panel_type text NOT NULL,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, panel_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_panel_credentials TO authenticated;
GRANT ALL ON public.activation_panel_credentials TO service_role;

ALTER TABLE public.activation_panel_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own panel credentials"
  ON public.activation_panel_credentials
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE TRIGGER trg_activation_panel_credentials_updated_at
  BEFORE UPDATE ON public.activation_panel_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
