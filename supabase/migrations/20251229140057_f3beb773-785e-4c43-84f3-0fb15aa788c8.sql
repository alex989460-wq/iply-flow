-- Create table for Zap Responder settings and sessions
CREATE TABLE public.zap_responder_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_base_url text NOT NULL DEFAULT 'https://api.zapresponder.com.br/v1',
  selected_session_id text,
  selected_session_name text,
  selected_session_phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zap_responder_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for admins only
CREATE POLICY "Admins can view zap_responder_settings"
ON public.zap_responder_settings
FOR SELECT
USING (is_admin());

CREATE POLICY "Admins can insert zap_responder_settings"
ON public.zap_responder_settings
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update zap_responder_settings"
ON public.zap_responder_settings
FOR UPDATE
USING (is_admin());

-- Insert a default settings row
INSERT INTO public.zap_responder_settings (api_base_url) VALUES ('https://api.zapresponder.com.br/v1');