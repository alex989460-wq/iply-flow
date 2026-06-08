CREATE POLICY "Users can read own evolution media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'evolution-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own evolution media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evolution-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own evolution media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'evolution-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'evolution-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own evolution media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'evolution-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);