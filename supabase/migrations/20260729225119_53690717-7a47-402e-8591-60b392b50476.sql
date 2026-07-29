CREATE POLICY "Authenticated can read tutorial files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'tutorials');

CREATE POLICY "Admins can upload tutorial files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tutorials' AND public.is_admin());

CREATE POLICY "Admins can update tutorial files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tutorials' AND public.is_admin());

CREATE POLICY "Admins can delete tutorial files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'tutorials' AND public.is_admin());