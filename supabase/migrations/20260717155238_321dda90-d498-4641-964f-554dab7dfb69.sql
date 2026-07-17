
-- Reseller checkout settings: slug, branding, methods, API key for external integrations
CREATE TABLE IF NOT EXISTS public.reseller_checkout_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT,
  logo_url TEXT,
  brand_color TEXT NOT NULL DEFAULT '#e11d48',
  headline TEXT,
  subheadline TEXT,
  enable_efi BOOLEAN NOT NULL DEFAULT true,
  enable_cakto BOOLEAN NOT NULL DEFAULT true,
  api_key TEXT NOT NULL UNIQUE,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_checkout_slug ON public.reseller_checkout_settings(slug);
CREATE INDEX IF NOT EXISTS idx_reseller_checkout_api_key ON public.reseller_checkout_settings(api_key);

-- Slug format guard (lowercase, digits, hyphen, 3-40 chars)
ALTER TABLE public.reseller_checkout_settings
  ADD CONSTRAINT reseller_checkout_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_checkout_settings TO authenticated;
GRANT ALL ON public.reseller_checkout_settings TO service_role;

ALTER TABLE public.reseller_checkout_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages checkout settings"
  ON public.reseller_checkout_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all checkout settings"
  ON public.reseller_checkout_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_reseller_checkout_settings_updated_at
  BEFORE UPDATE ON public.reseller_checkout_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
