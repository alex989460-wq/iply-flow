-- Add created_by column to plans table
ALTER TABLE public.plans 
ADD COLUMN created_by uuid REFERENCES public.profiles(user_id);

-- Add created_by column to servers table
ALTER TABLE public.servers 
ADD COLUMN created_by uuid REFERENCES public.profiles(user_id);

-- Update existing plans to be owned by admins (first admin found)
UPDATE public.plans 
SET created_by = (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1)
WHERE created_by IS NULL;

-- Update existing servers to be owned by admins (first admin found)
UPDATE public.servers 
SET created_by = (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1)
WHERE created_by IS NULL;

-- Drop existing restrictive policies on plans
DROP POLICY IF EXISTS "Admins can delete plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can insert plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can update plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can view plans" ON public.plans;

-- Create new policies for plans that allow users to manage their own
CREATE POLICY "Users can view own plans or admins view all"
ON public.plans FOR SELECT
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can insert own plans"
ON public.plans FOR INSERT
WITH CHECK (auth.uid() = created_by OR is_admin());

CREATE POLICY "Users can update own plans"
ON public.plans FOR UPDATE
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can delete own plans"
ON public.plans FOR DELETE
USING (is_admin() OR auth.uid() = created_by);

-- Drop existing restrictive policies on servers
DROP POLICY IF EXISTS "Admins can delete servers" ON public.servers;
DROP POLICY IF EXISTS "Admins can insert servers" ON public.servers;
DROP POLICY IF EXISTS "Admins can update servers" ON public.servers;
DROP POLICY IF EXISTS "Admins can view servers" ON public.servers;

-- Create new policies for servers that allow users to manage their own
CREATE POLICY "Users can view own servers or admins view all"
ON public.servers FOR SELECT
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can insert own servers"
ON public.servers FOR INSERT
WITH CHECK (auth.uid() = created_by OR is_admin());

CREATE POLICY "Users can update own servers"
ON public.servers FOR UPDATE
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can delete own servers"
ON public.servers FOR DELETE
USING (is_admin() OR auth.uid() = created_by);

-- Drop existing restrictive policies on customers
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can view customers" ON public.customers;

-- Create new policies for customers that allow users to manage their own
CREATE POLICY "Users can view own customers or admins view all"
ON public.customers FOR SELECT
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can insert own customers"
ON public.customers FOR INSERT
WITH CHECK (auth.uid() = created_by OR is_admin());

CREATE POLICY "Users can update own customers"
ON public.customers FOR UPDATE
USING (is_admin() OR auth.uid() = created_by);

CREATE POLICY "Users can delete own customers"
ON public.customers FOR DELETE
USING (is_admin() OR auth.uid() = created_by);

-- Update payments policies to allow users to manage payments for their own customers
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view payments" ON public.payments;

CREATE POLICY "Users can view payments for own customers"
ON public.payments FOR SELECT
USING (
  is_admin() OR 
  EXISTS (SELECT 1 FROM public.customers WHERE customers.id = payments.customer_id AND customers.created_by = auth.uid())
);

CREATE POLICY "Users can insert payments for own customers"
ON public.payments FOR INSERT
WITH CHECK (
  is_admin() OR 
  EXISTS (SELECT 1 FROM public.customers WHERE customers.id = customer_id AND customers.created_by = auth.uid())
);

CREATE POLICY "Users can update payments for own customers"
ON public.payments FOR UPDATE
USING (
  is_admin() OR 
  EXISTS (SELECT 1 FROM public.customers WHERE customers.id = payments.customer_id AND customers.created_by = auth.uid())
);

CREATE POLICY "Users can delete payments for own customers"
ON public.payments FOR DELETE
USING (
  is_admin() OR 
  EXISTS (SELECT 1 FROM public.customers WHERE customers.id = payments.customer_id AND customers.created_by = auth.uid())
);