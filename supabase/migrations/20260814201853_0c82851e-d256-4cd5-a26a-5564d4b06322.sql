ALTER TABLE public.reseller_checkout_settings ALTER COLUMN enable_mercadopago SET DEFAULT true;

UPDATE public.reseller_checkout_settings s
SET enable_mercadopago = true
WHERE COALESCE(s.enable_mercadopago, false) = false
  AND EXISTS (
    SELECT 1 FROM public.mercadopago_settings m
    WHERE m.user_id = s.user_id AND m.enabled = true AND m.access_token IS NOT NULL
  );

DROP POLICY IF EXISTS "Owners view their coupons" ON public.discount_coupons;
DROP POLICY IF EXISTS "Owners create their coupons" ON public.discount_coupons;
DROP POLICY IF EXISTS "Owners update their coupons" ON public.discount_coupons;
DROP POLICY IF EXISTS "Owners delete their coupons" ON public.discount_coupons;

CREATE POLICY "Owners view their coupons" ON public.discount_coupons FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners create their coupons" ON public.discount_coupons FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update their coupons" ON public.discount_coupons FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete their coupons" ON public.discount_coupons FOR DELETE TO authenticated USING (owner_id = auth.uid());