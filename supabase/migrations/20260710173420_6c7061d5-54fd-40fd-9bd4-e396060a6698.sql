DROP POLICY IF EXISTS "Service can insert pending manual renewals" ON public.pending_manual_renewals;
CREATE POLICY "Owners can insert own pending manual renewals"
ON public.pending_manual_renewals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id OR is_admin());