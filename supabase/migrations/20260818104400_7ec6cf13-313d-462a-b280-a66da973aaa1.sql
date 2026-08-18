ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS source_query text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS first_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_result text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS leads_user_phone_unique ON public.leads (user_id, phone);
CREATE INDEX IF NOT EXISTS leads_user_created_idx ON public.leads (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS lead_list_items_unique ON public.lead_list_items (list_id, lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_history TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.lead_lists TO service_role;
GRANT ALL ON public.lead_list_items TO service_role;
GRANT ALL ON public.lead_history TO service_role;