CREATE TABLE public.whatsapp_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL,
  currency text NOT NULL,
  category text NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication', 'service', 'business_agent', 'other')),
  pricing_type text NOT NULL DEFAULT 'regular',
  unit_price numeric(18,8) NOT NULL CHECK (unit_price >= 0),
  brl_exchange_rate numeric(18,8),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  source_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (brl_exchange_rate IS NULL OR brl_exchange_rate > 0)
);
GRANT SELECT ON public.whatsapp_pricing TO authenticated;
GRANT ALL ON public.whatsapp_pricing TO service_role;
ALTER TABLE public.whatsapp_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users view WhatsApp pricing" ON public.whatsapp_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage WhatsApp pricing" ON public.whatsapp_pricing FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_whatsapp_pricing_lookup ON public.whatsapp_pricing (market, currency, category, pricing_type, effective_from DESC) WHERE active = true;
CREATE TRIGGER update_whatsapp_pricing_updated_at BEFORE UPDATE ON public.whatsapp_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_message_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contact_id text,
  conversation_id text NOT NULL,
  message_id text NOT NULL,
  provider_message_id text,
  idempotency_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('official', 'unofficial')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text,
  category text CHECK (category IS NULL OR category IN ('marketing', 'utility', 'authentication', 'service', 'business_agent', 'other')),
  pricing_type text,
  billing_status text NOT NULL DEFAULT 'unknown' CHECK (billing_status IN ('charged', 'free', 'unknown', 'not_applicable')),
  cost_amount numeric(18,8) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  cost_currency text NOT NULL DEFAULT 'BRL',
  source_cost_amount numeric(18,8),
  source_currency text,
  brl_exchange_rate numeric(18,8),
  pricing_id uuid REFERENCES public.whatsapp_pricing(id) ON DELETE SET NULL,
  message_timestamp timestamptz NOT NULL,
  raw_pricing jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (brl_exchange_rate IS NULL OR brl_exchange_rate > 0),
  CHECK (source_cost_amount IS NULL OR source_cost_amount >= 0),
  CHECK (channel = 'official' OR (billing_status = 'not_applicable' AND cost_amount = 0)),
  CHECK (billing_status = 'charged' OR cost_amount = 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_costs TO authenticated;
GRANT ALL ON public.whatsapp_message_costs TO service_role;
ALTER TABLE public.whatsapp_message_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own WhatsApp message costs" ON public.whatsapp_message_costs FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own WhatsApp message costs" ON public.whatsapp_message_costs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own WhatsApp message costs" ON public.whatsapp_message_costs FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users delete own WhatsApp message costs" ON public.whatsapp_message_costs FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX idx_whatsapp_message_costs_idempotency ON public.whatsapp_message_costs (user_id, idempotency_key);
CREATE UNIQUE INDEX idx_whatsapp_message_costs_provider_message ON public.whatsapp_message_costs (user_id, channel, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_whatsapp_message_costs_contact_time ON public.whatsapp_message_costs (user_id, contact_id, message_timestamp DESC);
CREATE INDEX idx_whatsapp_message_costs_customer_time ON public.whatsapp_message_costs (user_id, customer_id, message_timestamp DESC);
CREATE INDEX idx_whatsapp_message_costs_period ON public.whatsapp_message_costs (user_id, message_timestamp DESC);
CREATE TRIGGER update_whatsapp_message_costs_updated_at BEFORE UPDATE ON public.whatsapp_message_costs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_whatsapp_cost_summary(_from timestamptz, _to timestamptz, _contact_id text DEFAULT NULL)
RETURNS TABLE (total_messages bigint, inbound_messages bigint, outbound_messages bigint, official_inbound bigint, official_outbound bigint, unofficial_inbound bigint, unofficial_outbound bigint, charged_messages bigint, unknown_messages bigint, estimated_cost_brl numeric, last_message_at timestamptz, last_official_at timestamptz, last_unofficial_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT count(*)::bigint, count(*) FILTER (WHERE direction = 'inbound')::bigint, count(*) FILTER (WHERE direction = 'outbound')::bigint,
    count(*) FILTER (WHERE channel = 'official' AND direction = 'inbound')::bigint, count(*) FILTER (WHERE channel = 'official' AND direction = 'outbound')::bigint,
    count(*) FILTER (WHERE channel = 'unofficial' AND direction = 'inbound')::bigint, count(*) FILTER (WHERE channel = 'unofficial' AND direction = 'outbound')::bigint,
    count(*) FILTER (WHERE billing_status = 'charged')::bigint, count(*) FILTER (WHERE billing_status = 'unknown')::bigint,
    coalesce(sum(cost_amount) FILTER (WHERE billing_status = 'charged' AND cost_currency = 'BRL'), 0)::numeric,
    max(message_timestamp), max(message_timestamp) FILTER (WHERE channel = 'official'), max(message_timestamp) FILTER (WHERE channel = 'unofficial')
  FROM public.whatsapp_message_costs
  WHERE user_id = auth.uid() AND message_timestamp >= _from AND message_timestamp < _to AND (_contact_id IS NULL OR contact_id = _contact_id);
$$;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_cost_summary(timestamptz, timestamptz, text) TO service_role;
