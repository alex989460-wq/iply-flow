-- Add foreign key from customers.created_by to profiles.user_id
ALTER TABLE public.customers 
DROP CONSTRAINT IF EXISTS customers_created_by_fkey;

-- Add proper foreign key to profiles
ALTER TABLE public.customers
ADD CONSTRAINT customers_created_by_profiles_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;