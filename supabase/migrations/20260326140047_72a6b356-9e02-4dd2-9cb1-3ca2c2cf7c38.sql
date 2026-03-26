ALTER TABLE public.reseller_api_settings 
ADD COLUMN IF NOT EXISTS natv2_api_key text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS natv2_base_url text DEFAULT NULL;