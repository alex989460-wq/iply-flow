CREATE TABLE IF NOT EXISTS public.mercadopago_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  access_token text,
  public_key text,
  payer_email text,
  webhook_secret text,
  webhook_configured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercadopago_settings TO authenticated;
GRANT ALL ON public.mercadopago_settings TO service_role;

ALTER TABLE public.mercadopago_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own mercadopago settings"
ON public.mercadopago_settings FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_mercadopago_settings_updated_at
BEFORE UPDATE ON public.mercadopago_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cobranças passam a identificar o provedor (Efí continua como padrão).
ALTER TABLE public.efi_charges ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'efi';
ALTER TABLE public.efi_charges ADD COLUMN IF NOT EXISTS provider_payment_id text;
CREATE INDEX IF NOT EXISTS efi_charges_provider_payment_id_idx ON public.efi_charges (provider_payment_id);

-- Toggle do Mercado Pago no checkout do revendedor.
ALTER TABLE public.reseller_checkout_settings ADD COLUMN IF NOT EXISTS enable_mercadopago boolean NOT NULL DEFAULT false;