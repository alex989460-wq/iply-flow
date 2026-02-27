
ALTER TABLE public.reseller_api_settings
  ADD COLUMN cakto_client_id TEXT DEFAULT '',
  ADD COLUMN cakto_client_secret TEXT DEFAULT '';
