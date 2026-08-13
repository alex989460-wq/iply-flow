CREATE OR REPLACE FUNCTION public.prevent_duplicate_pending_customer_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_username text;
BEGIN
  normalized_username := public.normalize_customer_username(NEW.username);
  IF normalized_username IS NULL OR NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.created_by = NEW.owner_id
      AND public.normalize_customer_username(c.username) = normalized_username
      AND c.status = 'ativa'
  ) THEN
    RAISE EXCEPTION 'duplicate_customer_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Este usuário já possui uma assinatura ativa. Use a renovação de cliente existente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pending_new_customers p
    WHERE p.owner_id = NEW.owner_id
      AND public.normalize_customer_username(p.username) = normalized_username
      AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND p.used = false
  ) THEN
    RAISE EXCEPTION 'duplicate_pending_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Já existe um pedido pendente para este usuário.';
  END IF;

  RETURN NEW;
END;
$function$;