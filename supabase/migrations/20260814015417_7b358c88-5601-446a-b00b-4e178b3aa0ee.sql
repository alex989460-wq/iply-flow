ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS p2cine_username text,
  ADD COLUMN IF NOT EXISTS p2cine_password text,
  ADD COLUMN IF NOT EXISTS p2cine_base_url text;