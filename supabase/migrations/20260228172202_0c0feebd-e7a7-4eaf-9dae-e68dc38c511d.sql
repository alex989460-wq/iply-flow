
-- Replace the_best_api_key with username/password fields
ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS the_best_username text DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS the_best_password text DEFAULT ''::text;

-- Remove the old api_key column (keep base_url)
ALTER TABLE public.reseller_api_settings
  DROP COLUMN IF EXISTS the_best_api_key;
