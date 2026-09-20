ALTER TABLE public.reseller_api_settings
  ADD COLUMN IF NOT EXISTS credit_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_alert_threshold integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS credit_alert_phone text;