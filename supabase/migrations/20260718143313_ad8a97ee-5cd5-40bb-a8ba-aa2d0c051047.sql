CREATE OR REPLACE FUNCTION public.normalize_customer_username(_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(lower(btrim(coalesce(_username, ''))), '')
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  normalized_username text;
  conflict_name text;
BEGIN
  normalized_username := public.normalize_customer_username(NEW.username);
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
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_customer_username ON public.customers;
CREATE TRIGGER trg_prevent_duplicate_customer_username
BEFORE INSERT OR UPDATE OF username, created_by ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_customer_username();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_pending_customer_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  ) THEN
    RAISE EXCEPTION 'duplicate_customer_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Este usuário já existe. Use a renovação de cliente existente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pending_new_customers p
    WHERE p.owner_id = NEW.owner_id
      AND public.normalize_customer_username(p.username) = normalized_username
      AND p.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'duplicate_pending_username:%', normalized_username
      USING ERRCODE = '23505', DETAIL = 'Já existe um pedido pendente para este usuário.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_pending_customer_username ON public.pending_new_customers;
CREATE TRIGGER trg_prevent_duplicate_pending_customer_username
BEFORE INSERT OR UPDATE OF username, owner_id ON public.pending_new_customers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_pending_customer_username();