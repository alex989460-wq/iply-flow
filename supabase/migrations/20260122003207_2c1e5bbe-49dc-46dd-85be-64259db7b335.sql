CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  sp_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Sao_Paulo');
  month_start DATE := date_trunc('month', sp_now)::date;
  today_date DATE := sp_now::date;
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