
ALTER TABLE public.evolution_billing_schedule
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS renew_button_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renew_button_label text DEFAULT 'Renovar agora',
  ADD COLUMN IF NOT EXISTS renew_button_url text;
