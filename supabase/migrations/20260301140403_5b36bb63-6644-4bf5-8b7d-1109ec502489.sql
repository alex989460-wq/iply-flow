
-- Add renewal image URL to billing_settings
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS renewal_image_url text DEFAULT '';

-- Create storage bucket for reseller assets (renewal images, logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reseller-assets', 'reseller-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view reseller assets (they're used in WhatsApp messages)
CREATE POLICY "Public read access for reseller assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'reseller-assets');

-- Users can upload their own assets (folder = user_id)
CREATE POLICY "Users can upload own reseller assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reseller-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own assets
CREATE POLICY "Users can update own reseller assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reseller-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own assets
CREATE POLICY "Users can delete own reseller assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'reseller-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
