ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS p2cine_api_key text;