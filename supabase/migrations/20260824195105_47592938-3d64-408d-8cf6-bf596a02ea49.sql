CREATE TABLE public.broadcast_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  template_name text NOT NULL,
  phone_number_id text,
  audience_mode text NOT NULL DEFAULT 'new',
  total_targets integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_campaigns TO service_role;

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their broadcast campaigns"
  ON public.broadcast_campaigns FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE INDEX idx_broadcast_campaigns_owner ON public.broadcast_campaigns (owner_id, started_at DESC);

CREATE TRIGGER update_broadcast_campaigns_updated_at
  BEFORE UPDATE ON public.broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.broadcast_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_campaign ON public.broadcast_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_wa_message ON public.broadcast_logs (wa_message_id);