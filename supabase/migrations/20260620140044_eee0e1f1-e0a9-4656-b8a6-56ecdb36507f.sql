ALTER TABLE public.billing_logs
ADD COLUMN IF NOT EXISTS sent_date_br date;

UPDATE public.billing_logs
SET sent_date_br = (sent_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE sent_date_br IS NULL;

CREATE OR REPLACE FUNCTION public.set_billing_log_sent_date_br()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.sent_date_br := (COALESCE(NEW.sent_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_billing_log_sent_date_br_trigger ON public.billing_logs;
CREATE TRIGGER set_billing_log_sent_date_br_trigger
BEFORE INSERT OR UPDATE OF sent_at ON public.billing_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_billing_log_sent_date_br();

DROP INDEX IF EXISTS public.billing_logs_one_sent_per_day_idx;
CREATE UNIQUE INDEX billing_logs_one_sent_per_day_idx
ON public.billing_logs (customer_id, billing_type, sent_date_br)
WHERE whatsapp_status IN ('pending', 'sent');