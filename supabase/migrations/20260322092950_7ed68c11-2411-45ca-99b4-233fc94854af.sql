CREATE OR REPLACE FUNCTION public.bulk_update_customers(
  usernames text[],
  server_ids uuid[],
  due_dates date[],
  statuses text[],
  screen_counts int[],
  plan_ids uuid[]
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count int := 0;
  i int;
BEGIN
  FOR i IN 1..array_length(usernames, 1) LOOP
    UPDATE customers SET
      server_id = server_ids[i],
      due_date = COALESCE(due_dates[i], due_date),
      status = statuses[i]::customer_status,
      screens = screen_counts[i],
      plan_id = plan_ids[i]
    WHERE username = usernames[i];
    IF FOUND THEN updated_count := updated_count + 1; END IF;
  END LOOP;
  RETURN updated_count;
END;
$$;