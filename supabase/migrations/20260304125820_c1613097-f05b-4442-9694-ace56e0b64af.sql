CREATE TABLE public.pending_renewal_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  used boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_pending_renewal_phone ON public.pending_renewal_selections(phone_normalized, used, expires_at);