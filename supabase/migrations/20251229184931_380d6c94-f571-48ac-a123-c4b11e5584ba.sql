-- Add DELETE policy for billing_logs table
CREATE POLICY "Admins can delete billing_logs"
ON public.billing_logs
FOR DELETE
USING (is_admin());