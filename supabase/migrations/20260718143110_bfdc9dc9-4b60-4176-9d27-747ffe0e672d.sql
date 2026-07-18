ALTER TABLE public.customers
ALTER COLUMN checkout_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));