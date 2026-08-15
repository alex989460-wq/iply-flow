DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;

CREATE POLICY "Admins can read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.platform_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;