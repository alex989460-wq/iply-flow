ALTER TABLE public.billing_logs
ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'default';

UPDATE public.billing_logs
SET provider = 'evolution'
WHERE message LIKE '[Evolution]%';

DROP INDEX IF EXISTS public.billing_logs_one_sent_per_day_idx;
DROP INDEX IF EXISTS public.billing_logs_unique_per_day;

CREATE UNIQUE INDEX billing_logs_one_sent_per_day_provider_idx
ON public.billing_logs (customer_id, billing_type, sent_date_br, provider)
WHERE whatsapp_status IN ('sent', 'pending');

CREATE INDEX IF NOT EXISTS idx_billing_logs_provider_sent_date
ON public.billing_logs (provider, sent_date_br, whatsapp_status, customer_id);