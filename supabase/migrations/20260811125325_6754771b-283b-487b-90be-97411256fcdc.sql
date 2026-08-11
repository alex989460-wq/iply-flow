ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS credit_cost numeric(10,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  sp_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Sao_Paulo');
  month_start DATE := date_trunc('month', sp_now)::date;
  today_date DATE := sp_now::date;
  current_user_id UUID := auth.uid();
BEGIN
  WITH rows AS (
    SELECT
      p.amount,
      p.payment_date,
      COALESCE(s.credit_cost, 0)
        * GREATEST(1, CEIL(COALESCE(pl.duration_days, 30)::numeric / 30))
        * GREATEST(1, COALESCE(c.screens, 1)) AS cost
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    LEFT JOIN servers s ON s.id = c.server_id
    LEFT JOIN plans pl ON pl.id = c.plan_id
    WHERE p.payment_date >= month_start
      AND (c.created_by = current_user_id OR is_admin())
  )
  SELECT json_build_object(
    'monthlyRevenue', COALESCE(SUM(amount), 0),
    'monthlyCost', COALESCE(SUM(cost), 0),
    'monthlyNetProfit', COALESCE(SUM(amount), 0) - COALESCE(SUM(cost), 0),
    'todayRevenue', COALESCE(SUM(CASE WHEN payment_date = today_date THEN amount ELSE 0 END), 0),
    'todayCost', COALESCE(SUM(CASE WHEN payment_date = today_date THEN cost ELSE 0 END), 0),
    'todayNetProfit', COALESCE(SUM(CASE WHEN payment_date = today_date THEN amount ELSE 0 END), 0)
                      - COALESCE(SUM(CASE WHEN payment_date = today_date THEN cost ELSE 0 END), 0),
    'todayPaymentCount', COALESCE(SUM(CASE WHEN payment_date = today_date THEN 1 ELSE 0 END), 0)
  ) INTO result
  FROM rows;

  RETURN result;
END;
$function$;