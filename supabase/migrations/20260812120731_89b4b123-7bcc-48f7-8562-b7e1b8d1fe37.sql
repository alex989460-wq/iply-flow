ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS vplay_panel_username text,
  ADD COLUMN IF NOT EXISTS vplay_panel_password text;