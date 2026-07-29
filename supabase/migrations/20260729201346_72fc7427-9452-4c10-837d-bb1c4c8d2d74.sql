CREATE OR REPLACE FUNCTION public.get_reseller_customer_counts()
RETURNS TABLE(owner_id uuid, total_customers bigint, active_customers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT ra.user_id
    FROM public.reseller_access ra
    WHERE public.is_admin()
       OR ra.user_id = auth.uid()
       OR ra.parent_reseller_id = auth.uid()
  )
  SELECT a.user_id AS owner_id,
         COUNT(c.id) AS total_customers,
         COUNT(c.id) FILTER (
           WHERE c.status = 'ativa'
             AND c.due_date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
         ) AS active_customers
  FROM allowed a
  LEFT JOIN public.customers c ON c.created_by = a.user_id
  GROUP BY a.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_reseller_customer_counts() TO authenticated;