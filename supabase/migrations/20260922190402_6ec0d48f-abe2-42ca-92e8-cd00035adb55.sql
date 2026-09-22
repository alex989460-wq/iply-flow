CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_username text;
  conflict_name text;
BEGIN
  normalized_username := public.normalize_customer_username(NEW.username);

  IF TG_OP = 'UPDATE'
     AND normalized_username IS NOT DISTINCT FROM public.normalize_customer_username(OLD.username)
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    RETURN NEW;
  END IF;

  IF normalized_username IS NULL OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO conflict_name
  FROM public.customers c
  WHERE c.created_by = NEW.created_by
    AND public.normalize_customer_username(c.username) = normalized_username
    AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF conflict_name IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_customer_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Já existe cliente com este usuário para este revendedor.';
  END IF;

  RETURN NEW;
END;
$function$;