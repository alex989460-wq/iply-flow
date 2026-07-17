ALTER TABLE public.reseller_checkout_settings ADD COLUMN IF NOT EXISTS activation_cakto_url TEXT;
ALTER TABLE public.activation_apps ADD COLUMN IF NOT EXISTS price_monthly NUMERIC(10,2);
ALTER TABLE public.activation_apps ADD COLUMN IF NOT EXISTS price_quarterly NUMERIC(10,2);
ALTER TABLE public.activation_apps ADD COLUMN IF NOT EXISTS price_annual NUMERIC(10,2) DEFAULT 25.00;