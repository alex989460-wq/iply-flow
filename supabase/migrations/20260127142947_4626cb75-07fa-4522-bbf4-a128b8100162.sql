-- Add vplay_integration_url column to billing_settings table
ALTER TABLE public.billing_settings
ADD COLUMN vplay_integration_url TEXT DEFAULT NULL;