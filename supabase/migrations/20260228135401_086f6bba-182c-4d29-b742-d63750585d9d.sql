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
BEGIN
  IF NEW.confirmed = true AND OLD.confirmed = false THEN
    SELECT duration_days INTO plan_duration
    FROM public.plans p
    JOIN public.customers c ON c.plan_id = p.id
    WHERE c.id = NEW.customer_id;
    
    IF plan_duration IS NOT NULL THEN
      -- Map standard durations to calendar months
      CASE plan_duration
        WHEN 30 THEN months_to_add := 1;
        WHEN 90 THEN months_to_add := 3;
        WHEN 180 THEN months_to_add := 6;
        WHEN 365 THEN months_to_add := 12;
        ELSE months_to_add := NULL;
      END CASE;

      SELECT due_date INTO current_due FROM public.customers WHERE id = NEW.customer_id;
      
      IF current_due IS NULL OR current_due < CURRENT_DATE THEN
        current_due := CURRENT_DATE;
      END IF;

      IF months_to_add IS NOT NULL THEN
        original_day := EXTRACT(DAY FROM current_due);
        new_due := current_due + (months_to_add || ' months')::interval;
        -- Clamp if day shifted (e.g. Jan 31 -> Mar 3 should be Feb 28)
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