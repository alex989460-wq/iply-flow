CREATE TABLE IF NOT EXISTS public.credit_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  min_qty integer NOT NULL,
  max_qty integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_price_tiers_valid_range CHECK (min_qty > 0 AND max_qty >= min_qty AND unit_price > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_price_tiers TO authenticated;
GRANT ALL ON public.credit_price_tiers TO service_role;
ALTER TABLE public.credit_price_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage credit tiers" ON public.credit_price_tiers;
CREATE POLICY "Owners manage credit tiers" ON public.credit_price_tiers FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.credit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  buyer_id uuid,
  buyer_email text,
  buyer_phone text,
  panel_username text,
  server_id uuid NOT NULL REFERENCES public.servers(id),
  server_name text,
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  provider text NOT NULL,
  txid text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  delivery_provider text,
  external_delivery_id text,
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivery_response jsonb,
  delivery_error text,
  balance_before numeric(12,2),
  balance_after numeric(12,2),
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_orders_positive_values CHECK (quantity > 0 AND unit_price > 0 AND total > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_orders TO authenticated;
GRANT ALL ON public.credit_orders TO service_role;
ALTER TABLE public.credit_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Parties view credit orders" ON public.credit_orders;
CREATE POLICY "Parties view credit orders" ON public.credit_orders FOR SELECT TO authenticated USING (seller_id = auth.uid() OR buyer_id = auth.uid());

ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS buyer_phone text;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS panel_username text;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS delivery_provider text;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS external_delivery_id text;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS delivery_response jsonb;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS balance_before numeric(12,2);
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS balance_after numeric(12,2);
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.credit_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS credit_price_tiers_owner_server_idx ON public.credit_price_tiers(owner_id, server_id);
CREATE INDEX IF NOT EXISTS credit_orders_seller_created_idx ON public.credit_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_orders_buyer_created_idx ON public.credit_orders(buyer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_credit_order_delivery(_order_id uuid)
RETURNS public.credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _order public.credit_orders;
BEGIN
  UPDATE public.credit_orders
  SET status = 'delivering', delivery_attempts = delivery_attempts + 1, delivery_error = NULL, updated_at = now()
  WHERE id = _order_id AND status IN ('paid', 'delivery_failed')
  RETURNING * INTO _order;
  RETURN _order;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_credit_order_delivery(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_credit_order_delivery(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_credit_order_delivery(
  _order_id uuid,
  _provider text,
  _external_id text,
  _response jsonb,
  _balance_before numeric,
  _balance_after numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _order public.credit_orders;
BEGIN
  SELECT * INTO _order FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _order.status = 'delivered' OR _order.status <> 'delivering' THEN RETURN false; END IF;

  UPDATE public.credit_orders SET
    status = 'delivered', delivery_provider = _provider, external_delivery_id = _external_id,
    delivery_response = _response, delivery_error = NULL, balance_before = _balance_before,
    balance_after = _balance_after, delivered_at = now(), updated_at = now()
  WHERE id = _order_id;

  IF _order.buyer_id IS NOT NULL THEN
    UPDATE public.reseller_access SET credits = COALESCE(credits, 0) + _order.quantity, updated_at = now()
    WHERE user_id = _order.buyer_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_credit_order_delivery(uuid,text,text,jsonb,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_credit_order_delivery(uuid,text,text,jsonb,numeric,numeric) TO service_role;