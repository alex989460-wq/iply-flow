GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_api_settings TO authenticated;
GRANT ALL ON public.reseller_api_settings TO service_role;
ALTER TABLE public.reseller_api_settings ENABLE ROW LEVEL SECURITY;