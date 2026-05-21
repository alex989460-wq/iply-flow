CREATE TABLE IF NOT EXISTS public.cakto_processed_events (
  cakto_id TEXT PRIMARY KEY,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cakto_processed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service can manage cakto_processed_events"
ON public.cakto_processed_events FOR ALL
USING (true) WITH CHECK (true);