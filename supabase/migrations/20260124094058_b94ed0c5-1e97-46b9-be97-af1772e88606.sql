-- Add Meta OAuth fields to zap_responder_settings
ALTER TABLE public.zap_responder_settings
ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
ADD COLUMN IF NOT EXISTS meta_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS meta_user_id TEXT,
ADD COLUMN IF NOT EXISTS meta_business_id TEXT,
ADD COLUMN IF NOT EXISTS meta_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS meta_display_phone TEXT,
ADD COLUMN IF NOT EXISTS meta_connected_at TIMESTAMP WITH TIME ZONE;