
DROP POLICY IF EXISTS "Admins manage all access codes" ON public.reseller_access_codes;

CREATE POLICY "View own access codes"
ON public.reseller_access_codes
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Insert own access codes"
ON public.reseller_access_codes
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Delete own unused access codes"
ON public.reseller_access_codes
FOR DELETE TO authenticated
USING ((created_by = auth.uid() AND used_by IS NULL) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Update access codes admin only"
ON public.reseller_access_codes
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
