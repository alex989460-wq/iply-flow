ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS sigma_base_url text,
  ADD COLUMN IF NOT EXISTS sigma_username text,
  ADD COLUMN IF NOT EXISTS sigma_password text;

CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'all',
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_coupons_owner_code_key ON public.discount_coupons (owner_id, upper(code));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_coupons TO authenticated;
GRANT ALL ON public.discount_coupons TO service_role;

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view their coupons" ON public.discount_coupons
  FOR SELECT TO authenticated USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY "Owners create their coupons" ON public.discount_coupons
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY "Owners update their coupons" ON public.discount_coupons
  FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR is_admin()) WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY "Owners delete their coupons" ON public.discount_coupons
  FOR DELETE TO authenticated USING (owner_id = auth.uid() OR is_admin());