
ALTER TABLE public.activation_apps
  ADD COLUMN IF NOT EXISTS price_monthly numeric,
  ADD COLUMN IF NOT EXISTS price_quarterly numeric,
  ADD COLUMN IF NOT EXISTS price_annual numeric DEFAULT 25.00;

ALTER TABLE public.reseller_checkout_settings
  ADD COLUMN IF NOT EXISTS activation_cakto_url text;
