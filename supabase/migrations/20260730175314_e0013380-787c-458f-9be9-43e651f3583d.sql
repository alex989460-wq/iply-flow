ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.create_reseller_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  _trial_days integer;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;

  SELECT COALESCE(trial_days, 30) INTO _trial_days
  FROM public.platform_settings
  WHERE singleton = true
  LIMIT 1;

  IF _trial_days IS NULL THEN
    _trial_days := 30;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin') THEN
    INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at)
    VALUES (NEW.user_id, COALESCE(user_email, ''), NEW.full_name, now() + (_trial_days || ' days')::interval);
  END IF;

  RETURN NEW;
END;
$function$;