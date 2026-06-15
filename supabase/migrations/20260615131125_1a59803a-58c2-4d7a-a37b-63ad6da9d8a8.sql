
CREATE TABLE public.bot_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  start_step_id TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_flows TO authenticated;
GRANT ALL ON public.bot_flows TO service_role;

ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own flows" ON public.bot_flows
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE TRIGGER trg_bot_flows_updated
  BEFORE UPDATE ON public.bot_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX bot_flows_owner_idx ON public.bot_flows(owner_id);
