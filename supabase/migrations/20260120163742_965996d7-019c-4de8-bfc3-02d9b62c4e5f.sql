-- Add screens column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS screens INTEGER NOT NULL DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.customers.screens IS 'Number of screens/devices allowed for this customer';