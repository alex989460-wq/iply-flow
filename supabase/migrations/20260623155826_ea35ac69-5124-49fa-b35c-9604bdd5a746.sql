
CREATE TABLE public.crm_oficial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_signup BOOLEAN NOT NULL DEFAULT true,
  auto_test_chat BOOLEAN NOT NULL DEFAULT true,
  auto_renew_notify BOOLEAN NOT NULL DEFAULT true,
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oficial_settings TO authenticated;
GRANT ALL ON public.crm_oficial_settings TO service_role;

ALTER TABLE public.crm_oficial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own crm_oficial_settings"
  ON public.crm_oficial_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all crm_oficial_settings"
  ON public.crm_oficial_settings
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER update_crm_oficial_settings_updated_at
  BEFORE UPDATE ON public.crm_oficial_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
