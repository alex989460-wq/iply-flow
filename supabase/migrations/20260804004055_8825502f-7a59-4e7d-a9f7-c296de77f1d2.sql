ALTER TABLE public.pending_new_customers ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.pending_new_customers TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.pending_new_customers TO authenticated;
GRANT ALL ON public.pending_new_customers TO service_role;

DROP POLICY IF EXISTS "Public checkout can create pending customers" ON public.pending_new_customers;
CREATE POLICY "Public checkout can create pending customers"
ON public.pending_new_customers FOR INSERT
TO anon, authenticated
WITH CHECK (owner_id IS NOT NULL);

DROP POLICY IF EXISTS "Owners can view their pending customers" ON public.pending_new_customers;
CREATE POLICY "Owners can view their pending customers"
ON public.pending_new_customers FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners can update their pending customers" ON public.pending_new_customers;
CREATE POLICY "Owners can update their pending customers"
ON public.pending_new_customers FOR UPDATE
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners can delete their pending customers" ON public.pending_new_customers;
CREATE POLICY "Owners can delete their pending customers"
ON public.pending_new_customers FOR DELETE
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));