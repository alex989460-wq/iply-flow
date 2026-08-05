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

  SELECT COALESCE(trial_days, 7) INTO _trial_days
  FROM public.platform_settings
  WHERE user_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF _trial_days IS NULL THEN
    _trial_days := 7;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin') THEN
    INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at)
    VALUES (NEW.user_id, COALESCE(user_email, ''), NEW.full_name, now() + (_trial_days || ' days')::interval);
  END IF;

  RETURN NEW;
END;
$function$;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS recaptcha_secret_key text,
  ADD COLUMN IF NOT EXISTS require_email_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.auth_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_verification_codes_email_idx ON public.auth_verification_codes (lower(email), purpose);

GRANT ALL ON public.auth_verification_codes TO service_role;
ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;