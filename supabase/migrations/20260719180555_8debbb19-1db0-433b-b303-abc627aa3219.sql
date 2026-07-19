
-- 1. Reverter vencimentos (1 mês para trás)
UPDATE public.customers SET due_date = '2026-07-22' WHERE id = '398c5b0e-5054-4f21-ba58-3b83ca4a33bb';
UPDATE public.customers SET due_date = '2026-07-16' WHERE id = 'b117e104-9c4f-41d6-9a36-cbf080b5a294';
UPDATE public.customers SET due_date = '2026-08-11' WHERE id = '0c3f53a3-b989-4a0f-a587-d9b20aff3017';
UPDATE public.customers SET due_date = '2026-07-18' WHERE id = '74d4a242-f53c-4f4e-bd4e-fb02d811d4b2';

-- 2. Excluir pagamentos indevidos
DELETE FROM public.payments WHERE id IN (
  '10505e98-541a-4f4f-90ec-266ebb891d13',
  '2b55ba66-d628-4d81-8e04-855135d79153',
  '323fc53f-8083-4ef3-8273-7d973fb9385d',
  'c29f36e9-19ab-4bb5-a6d4-a93e9515b810'
);

-- 3. Criar activation_requests como pagos (CLOUDDY)
INSERT INTO public.activation_requests (user_id, app_name, customer_name, customer_phone, mac_address, email, payment_method, amount, status)
VALUES
  ('1736505f-f34e-4153-abed-c3739f9c7c52','CLOUDDY','Lucas Martines Gargioni','5551992749393','','','efi',25.99,'pago'),
  ('1736505f-f34e-4153-abed-c3739f9c7c52','CLOUDDY','Margareth','5542991658207','','','efi',25.99,'pago'),
  ('1736505f-f34e-4153-abed-c3739f9c7c52','CLOUDDY','Deyve','5585991430064','','','efi',25.99,'pago'),
  ('1736505f-f34e-4153-abed-c3739f9c7c52','CLOUDDY','Fabricio Dantas Ferreira','5592992205753','','','efi',25.99,'pago');
