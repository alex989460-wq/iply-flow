
-- Add Rush panel credentials to reseller_api_settings
ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS rush_username text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS rush_password text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS rush_token text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS rush_base_url text DEFAULT ''::text;
