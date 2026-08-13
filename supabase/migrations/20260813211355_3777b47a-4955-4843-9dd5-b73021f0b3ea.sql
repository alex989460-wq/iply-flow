CREATE TABLE public.sigma_panel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  base_url text NOT NULL CHECK (char_length(trim(base_url)) BETWEEN 8 AND 500),
  username text NOT NULL CHECK (char_length(trim(username)) BETWEEN 1 AND 255),
  password text NOT NULL CHECK (char_length(password) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, base_url, username)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigma_panel_connections TO authenticated;
GRANT ALL ON public.sigma_panel_connections TO service_role;

ALTER TABLE public.sigma_panel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Sigma connections"
ON public.sigma_panel_connections FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create own Sigma connections"
ON public.sigma_panel_connections FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own Sigma connections"
ON public.sigma_panel_connections FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own Sigma connections"
ON public.sigma_panel_connections FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_sigma_panel_connections_updated_at
BEFORE UPDATE ON public.sigma_panel_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sigma_panel_connections (user_id, name, base_url, username, password)
SELECT user_id,
       COALESCE(NULLIF(regexp_replace(sigma_base_url, '^https?://', ''), ''), 'Painel Sigma'),
       sigma_base_url,
       sigma_username,
       sigma_password
FROM public.reseller_api_settings
WHERE NULLIF(trim(sigma_base_url), '') IS NOT NULL
  AND NULLIF(trim(sigma_username), '') IS NOT NULL
  AND NULLIF(sigma_password, '') IS NOT NULL
ON CONFLICT (user_id, base_url, username) DO NOTHING;