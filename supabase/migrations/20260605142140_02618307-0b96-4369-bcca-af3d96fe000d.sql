
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS use_evolution_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evolution_instance text,
  ADD COLUMN IF NOT EXISTS evolution_msg_d_minus_1 text,
  ADD COLUMN IF NOT EXISTS evolution_msg_d0 text,
  ADD COLUMN IF NOT EXISTS evolution_msg_d_plus_1 text;
