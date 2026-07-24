
CREATE OR REPLACE FUNCTION public.renew_customer_due_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  plan_duration INTEGER;
  months_to_add INTEGER;
  current_due DATE;
  new_due DATE;
  original_day INTEGER;
  sp_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  should_process BOOLEAN := false;
BEGIN
  -- Skip: Cakto webhook already advances due_date manually before inserting the payment.
  IF NEW.source IS NOT NULL AND NEW.source LIKE 'cakto%' THEN
    RETURN NEW;
  END IF;

  IF NEW.confirmed = true THEN
    IF TG_OP = 'INSERT' THEN
      should_process := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.confirmed = false THEN
      should_process := true;
    END IF;
  END IF;

  IF should_process THEN
    SELECT duration_days INTO plan_duration
    FROM public.plans p
    JOIN public.customers c ON c.plan_id = p.id
    WHERE c.id = NEW.customer_id;
    
    IF plan_duration IS NOT NULL THEN
      CASE plan_duration
        WHEN 30 THEN months_to_add := 1;
        WHEN 90 THEN months_to_add := 3;
        WHEN 180 THEN months_to_add := 6;
        WHEN 365 THEN months_to_add := 12;
        ELSE months_to_add := NULL;
      END CASE;

      SELECT due_date INTO current_due FROM public.customers WHERE id = NEW.customer_id;
      
      IF current_due IS NULL OR current_due < sp_today THEN
        current_due := sp_today;
      END IF;

      IF months_to_add IS NOT NULL THEN
        original_day := EXTRACT(DAY FROM current_due);
        new_due := current_due + (months_to_add || ' months')::interval;
        IF EXTRACT(DAY FROM new_due) <> original_day THEN
          new_due := (date_trunc('month', new_due))::date - 1;
        END IF;
      ELSE
        new_due := current_due + (plan_duration || ' days')::interval;
      END IF;

      UPDATE public.customers
      SET due_date = new_due, status = 'ativa'
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
