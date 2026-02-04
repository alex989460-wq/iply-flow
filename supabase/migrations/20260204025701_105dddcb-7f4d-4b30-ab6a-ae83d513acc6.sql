-- Create table for XUI One credentials per reseller
CREATE TABLE public.xui_one_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  access_code TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.xui_one_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only manage their own settings
CREATE POLICY "Users can view own xui_one_settings"
ON public.xui_one_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own xui_one_settings"
ON public.xui_one_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own xui_one_settings"
ON public.xui_one_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own xui_one_settings"
ON public.xui_one_settings FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_xui_one_settings_updated_at
BEFORE UPDATE ON public.xui_one_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();