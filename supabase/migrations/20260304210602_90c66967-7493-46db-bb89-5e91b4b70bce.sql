
CREATE TABLE public.pending_activation_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  app_name text NOT NULL,
  customer_name text NOT NULL,
  mac_address text,
  email text,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_activation_data ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public checkout page)
CREATE POLICY "Anyone can insert pending_activation_data"
  ON public.pending_activation_data FOR INSERT
  WITH CHECK (true);

-- Allow service role to read/update (webhook)
CREATE POLICY "Anyone can read pending_activation_data"
  ON public.pending_activation_data FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update pending_activation_data"
  ON public.pending_activation_data FOR UPDATE
  USING (true);
