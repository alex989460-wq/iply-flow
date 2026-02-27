
-- Table for reseller-specific API settings (Cakto, NATV, etc.)
CREATE TABLE public.reseller_api_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cakto_webhook_secret TEXT DEFAULT '',
  natv_api_key TEXT DEFAULT '',
  natv_base_url TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.reseller_api_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api settings"
  ON public.reseller_api_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api settings"
  ON public.reseller_api_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api settings"
  ON public.reseller_api_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api settings"
  ON public.reseller_api_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_reseller_api_settings_updated_at
  BEFORE UPDATE ON public.reseller_api_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
