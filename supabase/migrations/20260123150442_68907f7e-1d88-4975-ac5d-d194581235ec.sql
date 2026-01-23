-- Add api_type column to zap_responder_settings to support Evolution API
ALTER TABLE public.zap_responder_settings 
ADD COLUMN IF NOT EXISTS api_type text NOT NULL DEFAULT 'zap_responder';

-- Add instance_name column for Evolution API
ALTER TABLE public.zap_responder_settings 
ADD COLUMN IF NOT EXISTS instance_name text;

-- Add comment for clarity
COMMENT ON COLUMN public.zap_responder_settings.api_type IS 'Type of API: zap_responder or evolution';
COMMENT ON COLUMN public.zap_responder_settings.instance_name IS 'Instance name for Evolution API';