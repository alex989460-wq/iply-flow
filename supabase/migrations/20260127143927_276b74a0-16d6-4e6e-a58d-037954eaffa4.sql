-- Add vplay_key_message column to billing_settings
ALTER TABLE public.billing_settings
ADD COLUMN vplay_key_message TEXT DEFAULT 'XCLOUD';