-- Create optimized function for dashboard stats
CREATE OR REPLACE FUNCTION get_dashboard_stats_optimized()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    'activeCustomers', COALESCE(SUM(CASE WHEN status = 'ativa' THEN 1 ELSE 0 END), 0),
    'inactiveCustomers', COALESCE(SUM(CASE WHEN status = 'inativa' THEN 1 ELSE 0 END), 0),
    'suspendedCustomers', COALESCE(SUM(CASE WHEN status = 'suspensa' THEN 1 ELSE 0 END), 0),
    'dueTodayCustomers', COALESCE(SUM(CASE WHEN due_date = today_date THEN 1 ELSE 0 END), 0),
    'dueTomorrowCustomers', COALESCE(SUM(CASE WHEN due_date = tomorrow_date THEN 1 ELSE 0 END), 0),
    'overdueOneDayCustomers', COALESCE(SUM(CASE WHEN due_date = yesterday_date THEN 1 ELSE 0 END), 0),
    'overdueCustomers', COALESCE(SUM(CASE WHEN due_date < today_date THEN 1 ELSE 0 END), 0),
    'monthlyProjection', COALESCE(SUM(
      CASE WHEN status = 'ativa' THEN 
        COALESCE(custom_price, (SELECT price FROM plans WHERE plans.id = customers.plan_id), 0)
      ELSE 0 END
    ), 0)
  ) INTO result
  FROM customers
  WHERE created_by = current_user_id OR is_admin();
  
  RETURN result;
END;
$$;

-- Create function for monthly revenue
CREATE OR REPLACE FUNCTION get_monthly_revenue()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  today_date DATE := CURRENT_DATE;
  current_user_id UUID := auth.uid();
BEGIN
  SELECT json_build_object(
    'monthlyRevenue', COALESCE(SUM(amount), 0),
    'todayRevenue', COALESCE(SUM(CASE WHEN payment_date = today_date THEN amount ELSE 0 END), 0),
    'todayPaymentCount', COALESCE(SUM(CASE WHEN payment_date = today_date THEN 1 ELSE 0 END), 0)
  ) INTO result
  FROM payments p
  WHERE payment_date >= month_start
    AND EXISTS (
      SELECT 1 FROM customers c 
      WHERE c.id = p.customer_id 
        AND (c.created_by = current_user_id OR is_admin())
    );
  
  RETURN result;
END;
$$;

-- Create function for plan distribution
CREATE OR REPLACE FUNCTION get_plan_distribution()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'name', COALESCE(plan_name, 'Sem plano'),
        'value', count
      )
    ), '[]'::json)
    FROM (
      SELECT 
        pl.plan_name,
        COUNT(c.id) as count
      FROM customers c
      LEFT JOIN plans pl ON pl.id = c.plan_id
      WHERE c.created_by = current_user_id OR is_admin()
      GROUP BY pl.plan_name
      ORDER BY count DESC
    ) sub
  );
END;
$$;

-- Create function for server distribution
CREATE OR REPLACE FUNCTION get_server_distribution()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'name', COALESCE(server_name, 'Sem servidor'),
        'customers', count
      )
    ), '[]'::json)
    FROM (
      SELECT 
        s.server_name,
        COUNT(c.id) as count
      FROM customers c
      LEFT JOIN servers s ON s.id = c.server_id
      WHERE c.created_by = current_user_id OR is_admin()
      GROUP BY s.server_name
      ORDER BY count DESC
    ) sub
  );
END;
$$;