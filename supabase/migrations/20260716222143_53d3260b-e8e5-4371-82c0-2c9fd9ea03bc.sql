-- 1) efi_settings: 1 config por revendedor
CREATE TABLE public.efi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  client_id text,
  client_secret text,
  pix_key text,
  cert_p12_base64 text,
  cert_password text NOT NULL DEFAULT '',
  webhook_configured_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efi_settings TO authenticated;
GRANT ALL ON public.efi_settings TO service_role;

ALTER TABLE public.efi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own efi settings"
  ON public.efi_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all efi settings"
  ON public.efi_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER efi_settings_updated_at
  BEFORE UPDATE ON public.efi_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) efi_charges: cobranças Pix criadas + status
CREATE TABLE public.efi_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  customer_id uuid,
  pending_id uuid,
  pending_kind text CHECK (pending_kind IN ('new_customer','manual_renewal','manual')),
  txid text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled')),
  environment text NOT NULL,
  pix_copia_cola text,
  qrcode_base64 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX efi_charges_owner_idx ON public.efi_charges(owner_id);
CREATE INDEX efi_charges_status_idx ON public.efi_charges(status);
CREATE INDEX efi_charges_customer_idx ON public.efi_charges(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.efi_charges TO authenticated;
GRANT ALL ON public.efi_charges TO service_role;

ALTER TABLE public.efi_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own charges"
  ON public.efi_charges FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owners insert own charges"
  ON public.efi_charges FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owners update own charges"
  ON public.efi_charges FOR UPDATE
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owners delete own charges"
  ON public.efi_charges FOR DELETE
  USING (auth.uid() = owner_id OR public.is_admin());

CREATE TRIGGER efi_charges_updated_at
  BEFORE UPDATE ON public.efi_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();