CREATE OR REPLACE FUNCTION public.batch_update_customers_natv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- This is a one-time function to batch update NATV customers
  -- It will be dropped after execution
  NULL;
END;
$$;