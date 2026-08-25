ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_customer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS template_language text;

DROP POLICY IF EXISTS "Owners can view their customers broadcast logs" ON public.broadcast_logs;
CREATE POLICY "Owners can view their customers broadcast logs"
ON public.broadcast_logs FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.id = broadcast_logs.customer_id AND c.created_by = auth.uid()
));

GRANT SELECT ON public.broadcast_logs TO authenticated;