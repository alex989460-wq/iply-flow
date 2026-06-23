ALTER TABLE public.crm_oficial_billing_schedule
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS phone_number_id text;