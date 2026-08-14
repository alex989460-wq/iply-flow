ALTER TABLE public.sigma_panel_connections
  ADD COLUMN IF NOT EXISTS proxy_url text,
  ADD COLUMN IF NOT EXISTS proxy_secret text;

ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS sigma_proxy_url text,
  ADD COLUMN IF NOT EXISTS sigma_proxy_secret text;