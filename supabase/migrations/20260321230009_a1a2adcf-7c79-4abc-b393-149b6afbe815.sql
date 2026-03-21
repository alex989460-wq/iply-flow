
-- Restore deleted customers from payment_confirmations data
-- Using the most recent payment confirmation per phone number
INSERT INTO customers (name, phone, due_date, status, created_by, plan_id, start_date)
SELECT 
  lpp.customer_name,
  lpp.customer_phone,
  lpp.new_due_date,
  CASE WHEN lpp.new_due_date >= CURRENT_DATE THEN 'ativa'::customer_status ELSE 'inativa'::customer_status END,
  '1736505f-f34e-4153-abed-c3739f9c7c52'::uuid,
  -- Match plan by name (use the admin's plans)
  (SELECT p.id FROM plans p WHERE p.plan_name = lpp.plan_name AND p.created_by = '1736505f-f34e-4153-abed-c3739f9c7c52' LIMIT 1),
  lpp.created_at::date
FROM (
  SELECT DISTINCT ON (customer_phone)
    customer_name,
    customer_phone,
    plan_name,
    new_due_date,
    created_at
  FROM payment_confirmations
  WHERE customer_phone IS NOT NULL 
    AND customer_phone != ''
  ORDER BY customer_phone, new_due_date DESC
) lpp
WHERE lpp.customer_phone NOT IN (SELECT phone FROM customers)
ON CONFLICT DO NOTHING;
