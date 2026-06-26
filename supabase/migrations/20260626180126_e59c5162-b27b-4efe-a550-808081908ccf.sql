CREATE POLICY "Authenticated can upload meta-template-uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reseller-assets' AND (storage.foldername(name))[1] = 'meta-template-uploads');

CREATE POLICY "Authenticated can update meta-template-uploads"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reseller-assets' AND (storage.foldername(name))[1] = 'meta-template-uploads');

CREATE POLICY "Public read reseller-assets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'reseller-assets');