-- Drop existing SELECT policies that show all data to admins
DROP POLICY IF EXISTS "Users can view own servers or admins view all" ON public.servers;
DROP POLICY IF EXISTS "Users can view own plans or admins view all" ON public.plans;
DROP POLICY IF EXISTS "Users can view own customers or admins view all" ON public.customers;

-- Create new SELECT policies that only show own data
CREATE POLICY "Users can view own servers" 
ON public.servers 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can view own plans" 
ON public.plans 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can view own customers" 
ON public.customers 
FOR SELECT 
USING (auth.uid() = created_by);