
-- Add The Best API settings columns to reseller_api_settings
ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS the_best_api_key text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS the_best_base_url text DEFAULT ''::text;
