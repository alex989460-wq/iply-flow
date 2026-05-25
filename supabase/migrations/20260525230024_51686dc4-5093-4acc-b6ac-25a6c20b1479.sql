
CREATE TABLE public.pending_manual_renewals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  username TEXT,
  server_id UUID,
  server_name TEXT,
  server_host TEXT,
  plan_name TEXT,
  amount NUMERIC DEFAULT 0,
  new_due_date DATE,
  reason TEXT NOT NULL DEFAULT 'manual',
  error_details JSONB,
  source TEXT DEFAULT 'cakto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pmr_owner ON public.pending_manual_renewals(owner_id, created_at DESC);

ALTER TABLE public.pending_manual_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own pending manual renewals"
ON public.pending_manual_renewals FOR SELECT
USING (auth.uid() = owner_id OR is_admin());

CREATE POLICY "Owners can delete own pending manual renewals"
ON public.pending_manual_renewals FOR DELETE
USING (auth.uid() = owner_id OR is_admin());

CREATE POLICY "Owners can update own pending manual renewals"
ON public.pending_manual_renewals FOR UPDATE
USING (auth.uid() = owner_id OR is_admin());

CREATE POLICY "Service can insert pending manual renewals"
ON public.pending_manual_renewals FOR INSERT
WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_manual_renewals;
ALTER TABLE public.pending_manual_renewals REPLICA IDENTITY FULL;
