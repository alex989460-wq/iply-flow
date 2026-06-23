ALTER TABLE public.crm_oficial_billing_schedule
  ADD COLUMN IF NOT EXISTS template_d_minus_1 TEXT,
  ADD COLUMN IF NOT EXISTS template_d0 TEXT,
  ADD COLUMN IF NOT EXISTS template_d_plus_1 TEXT,
  ADD COLUMN IF NOT EXISTS template_lang_d_minus_1 TEXT,
  ADD COLUMN IF NOT EXISTS template_lang_d0 TEXT,
  ADD COLUMN IF NOT EXISTS template_lang_d_plus_1 TEXT;