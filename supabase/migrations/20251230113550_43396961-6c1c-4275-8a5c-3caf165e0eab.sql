-- Add created_by column to track which user created each customer
ALTER TABLE public.customers 
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Add custom_price column for customers with special pricing
ALTER TABLE public.customers 
ADD COLUMN custom_price NUMERIC DEFAULT NULL;

-- Update existing customers to set created_by to the first admin (optional backfill)
-- This is just for existing data, new customers will have the proper user set