
ALTER TABLE public.billing_schedule
  ADD COLUMN IF NOT EXISTS template_d_minus_1 text DEFAULT 'vence_amanha',
  ADD COLUMN IF NOT EXISTS template_d0 text DEFAULT 'hoje01',
  ADD COLUMN IF NOT EXISTS template_d_plus_1 text DEFAULT 'vencido';
