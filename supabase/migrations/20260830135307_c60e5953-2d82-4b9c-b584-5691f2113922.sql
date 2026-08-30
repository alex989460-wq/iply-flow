ALTER TABLE public.reseller_access ADD COLUMN IF NOT EXISTS affiliate_code text;

CREATE OR REPLACE FUNCTION public.gen_affiliate_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reseller_access WHERE affiliate_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE public.reseller_access SET affiliate_code = public.gen_affiliate_code() WHERE affiliate_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reseller_access_affiliate_code_key ON public.reseller_access (affiliate_code);

CREATE OR REPLACE FUNCTION public.set_affiliate_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_code IS NULL OR NEW.affiliate_code = '' THEN
    NEW.affiliate_code := public.gen_affiliate_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_affiliate_code ON public.reseller_access;
CREATE TRIGGER trg_set_affiliate_code
BEFORE INSERT ON public.reseller_access
FOR EACH ROW EXECUTE FUNCTION public.set_affiliate_code();