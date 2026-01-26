-- Add extra_months column to customers table
ALTER TABLE public.customers 
ADD COLUMN extra_months integer NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.customers.extra_months IS 'Tracks extra months due to incorrect renewals. Decremented on each renewal until 0.';