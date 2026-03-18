
-- Add checkout_url to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS checkout_url text DEFAULT '';

-- Add is_public to servers table
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Create pending_new_customers table for checkout flow
CREATE TABLE public.pending_new_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  username text NOT NULL,
  server_id uuid REFERENCES public.servers(id),
  plan_id uuid REFERENCES public.plans(id),
  checkout_url text,
  used boolean DEFAULT false,
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_new_customers ENABLE ROW LEVEL SECURITY;

-- Public insert (from checkout page, no auth)
CREATE POLICY "Anyone can insert pending_new_customers" ON public.pending_new_customers
  FOR INSERT WITH CHECK (true);

-- Public select (for webhook to read)
CREATE POLICY "Anyone can read pending_new_customers" ON public.pending_new_customers
  FOR SELECT USING (true);

-- Public update (for webhook to mark as used)
CREATE POLICY "Anyone can update pending_new_customers" ON public.pending_new_customers
  FOR UPDATE USING (true);
