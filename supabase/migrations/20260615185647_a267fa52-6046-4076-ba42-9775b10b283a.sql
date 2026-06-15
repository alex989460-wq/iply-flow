
-- Remove duplicate billing_logs keeping the earliest for each (customer, billing_type, day)
DELETE FROM public.billing_logs a
USING public.billing_logs b
WHERE a.ctid > b.ctid
  AND a.customer_id = b.customer_id
  AND a.billing_type = b.billing_type
  AND (a.sent_at AT TIME ZONE 'America/Sao_Paulo')::date
      = (b.sent_at AT TIME ZONE 'America/Sao_Paulo')::date;

-- Unique index to prevent further duplicates
CREATE UNIQUE INDEX IF NOT EXISTS billing_logs_unique_per_day
  ON public.billing_logs (
    customer_id,
    billing_type,
    ((sent_at AT TIME ZONE 'America/Sao_Paulo')::date)
  );
