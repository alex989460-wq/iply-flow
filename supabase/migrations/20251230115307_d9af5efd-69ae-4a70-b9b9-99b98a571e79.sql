-- Add username field for customer's IPTV login
ALTER TABLE public.customers 
ADD COLUMN username TEXT;