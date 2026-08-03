ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_user_id_key UNIQUE (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;