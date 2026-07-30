ALTER TABLE public.reseller_access
  ADD COLUMN IF NOT EXISTS max_official_channels integer NOT NULL DEFAULT 1;