-- Fix: Active customers should only count those NOT overdue
CREATE OR REPLACE FUNCTION public.get_dashboard_stats_optimized()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  today_date DATE := CURRENT_DATE;
  tomorrow_date DATE := CURRENT_DATE + 1;
  yesterday_date DATE := CURRENT_DATE - 1;
  month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  current_user_id UUID := auth.uid();
BEGIN
  SELECT json_build_object(
    'totalCustomers', COALESCE(SUM(1), 0),
    -- FIXED: Active = status 'ativa' AND not overdue (due_date >= today)
    'activeCustomers', COALESCE(SUM(CASE WHEN status = 'ativa' AND due_date >= today_date THEN 1 ELSE 0 END), 0),
    'inactiveCustomers', COALESCE(SUM(CASE WHEN status = 'inativa' THEN 1 ELSE 0 END), 0),
    'suspendedCustomers', COALESCE(SUM(CASE WHEN status = 'suspensa' THEN 1 ELSE 0 END), 0),
    'dueTodayCustomers', COALESCE(SUM(CASE WHEN due_date = today_date THEN 1 ELSE 0 END), 0),
    'dueTomorrowCustomers', COALESCE(SUM(CASE WHEN due_date = tomorrow_date THEN 1 ELSE 0 END), 0),
    'overdueOneDayCustomers', COALESCE(SUM(CASE WHEN due_date = yesterday_date THEN 1 ELSE 0 END), 0),
    'overdueCustomers', COALESCE(SUM(CASE WHEN due_date < today_date THEN 1 ELSE 0 END), 0),
    'monthlyProjection', COALESCE(SUM(
      CASE WHEN status = 'ativa' AND due_date >= today_date THEN 
        COALESCE(custom_price, (SELECT price FROM plans WHERE plans.id = customers.plan_id), 0)
      ELSE 0 END
    ), 0)
  ) INTO result
  FROM customers
  WHERE created_by = current_user_id OR is_admin();
  
  RETURN result;
END;
$function$;