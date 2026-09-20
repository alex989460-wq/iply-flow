DROP POLICY IF EXISTS "Users can view own customers" ON public.customers;
CREATE POLICY "Users can view own customers" ON public.customers
  FOR SELECT USING (is_admin() OR auth.uid() = created_by);