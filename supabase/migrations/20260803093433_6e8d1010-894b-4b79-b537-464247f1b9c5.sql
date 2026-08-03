DROP POLICY IF EXISTS "Users can update own reseller assets" ON storage.objects;
CREATE POLICY "Users can update own reseller assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reseller-assets' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'reseller-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can read own reseller assets" ON storage.objects;
CREATE POLICY "Users can read own reseller assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reseller-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);