GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_requests TO authenticated;
GRANT ALL ON public.activation_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_panel_credentials TO authenticated;
GRANT ALL ON public.activation_panel_credentials TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_templates TO authenticated;
GRANT ALL ON public.playlist_templates TO service_role;

DROP POLICY IF EXISTS "Users can insert own activation_requests" ON public.activation_requests;
CREATE POLICY "Users can insert own activation_requests"
ON public.activation_requests
FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = user_id) OR public.is_admin());