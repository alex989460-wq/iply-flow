-- ---------- settings ----------
CREATE TABLE public.referral_settings (
  owner_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  reward_amount numeric NOT NULL DEFAULT 10,
  referee_discount numeric NOT NULL DEFAULT 0,
  max_rewards_per_month integer NOT NULL DEFAULT 10,
  min_order_amount numeric NOT NULL DEFAULT 0,
  max_discount_percent integer NOT NULL DEFAULT 50,
  credit_expire_days integer NOT NULL DEFAULT 90,
  headline text,
  terms text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_settings TO authenticated;
GRANT ALL ON public.referral_settings TO service_role;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_settings_owner_all" ON public.referral_settings
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- referrals ----------
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referee_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  referee_name text,
  referee_phone text,
  status text NOT NULL DEFAULT 'pending',
  reward_amount numeric NOT NULL DEFAULT 0,
  qualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referrals_unique_referee ON public.referrals(referee_customer_id) WHERE referee_customer_id IS NOT NULL;
CREATE INDEX referrals_owner_idx ON public.referrals(owner_id, created_at DESC);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_owner_all" ON public.referrals
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- credits ledger ----------
CREATE TABLE public.referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  kind text NOT NULL DEFAULT 'earn',
  txid text,
  note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_credits_customer_idx ON public.referral_credits(customer_id);
CREATE INDEX referral_credits_owner_idx ON public.referral_credits(owner_id, created_at DESC);
CREATE UNIQUE INDEX referral_credits_txid_unique ON public.referral_credits(txid) WHERE txid IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_credits TO authenticated;
GRANT ALL ON public.referral_credits TO service_role;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_credits_owner_all" ON public.referral_credits
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- customers columns ----------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_unique
  ON public.customers(created_by, referral_code) WHERE referral_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_customer_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_referral_code ON public.customers;
CREATE TRIGGER trg_customers_referral_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_customer_referral_code();

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.referral_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_referral_settings_updated BEFORE UPDATE ON public.referral_settings
  FOR EACH ROW EXECUTE FUNCTION public.referral_touch_updated_at();
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.referral_touch_updated_at();