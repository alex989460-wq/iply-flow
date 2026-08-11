CREATE OR REPLACE FUNCTION public.get_dashboard_stats_optimized()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  result JSON;
  sp_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Sao_Paulo');
  today_date DATE := sp_now::date;
  tomorrow_date DATE := (sp_now + interval '1 day')::date;
  yesterday_date DATE := (sp_now - interval '1 day')::date;
  month_start DATE := date_trunc('month', sp_now)::date;
  current_user_id UUID := auth.uid();
BEGIN
  SELECT json_build_object(
    'totalCustomers', COALESCE(SUM(1), 0),
    'activeCustomers', COALESCE(SUM(CASE WHEN status = 'ativa' AND due_date >= today_date THEN 1 ELSE 0 END), 0),
    'inactiveCustomers', COALESCE(SUM(CASE WHEN status = 'inativa' THEN 1 ELSE 0 END), 0),
    'suspendedCustomers', COALESCE(SUM(CASE WHEN status = 'suspensa' THEN 1 ELSE 0 END), 0),
    'dueTodayCustomers', COALESCE(SUM(CASE WHEN due_date = today_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'dueTomorrowCustomers', COALESCE(SUM(CASE WHEN due_date = tomorrow_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'overdueOneDayCustomers', COALESCE(SUM(CASE WHEN due_date = yesterday_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'overdueCustomers', COALESCE(SUM(CASE WHEN due_date < today_date AND status IN ('ativa','inativa') THEN 1 ELSE 0 END), 0),
    'newCustomersThisMonth', COALESCE(SUM(CASE WHEN created_at >= month_start THEN 1 ELSE 0 END), 0),
    'monthlyProjection', COALESCE(SUM(
      CASE WHEN status = 'ativa' AND due_date >= today_date THEN 
        COALESCE(custom_price, (SELECT price FROM plans WHERE plans.id = customers.plan_id), 0)
      ELSE 0 END
    ), 0)
  ) INTO result
  FROM customers
  WHERE created_by = current_user_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
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
      AND c.created_by = current_user_id
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

CREATE OR REPLACE FUNCTION public.get_plan_distribution()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('name', COALESCE(plan_name, 'Sem plano'), 'value', count)), '[]'::json)
    FROM (
      SELECT pl.plan_name, COUNT(c.id) as count
      FROM customers c
      LEFT JOIN plans pl ON pl.id = c.plan_id
      WHERE c.created_by = current_user_id
      GROUP BY pl.plan_name
      ORDER BY count DESC
    ) sub
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_server_distribution()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('name', COALESCE(server_name, 'Sem servidor'), 'customers', count)), '[]'::json)
    FROM (
      SELECT s.server_name, COUNT(c.id) AS count
      FROM customers c
      LEFT JOIN servers s ON s.id = c.server_id
      WHERE c.created_by = current_user_id
        AND c.status = 'ativa'
      GROUP BY s.server_name
      ORDER BY count DESC
    ) sub
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats_optimized() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_monthly_revenue() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_plan_distribution() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_server_distribution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_optimized() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_distribution() TO authenticated;