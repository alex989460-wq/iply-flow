ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS uniplay_username text,
  ADD COLUMN IF NOT EXISTS uniplay_password text,
  ADD COLUMN IF NOT EXISTS uniplay_base_url text;