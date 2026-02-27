
-- Table to store payment confirmation data for the public dynamic page
CREATE TABLE public.payment_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  plan_name TEXT,
  duration_days INTEGER NOT NULL DEFAULT 30,
  new_due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;

-- Public read-only access (anyone with the link can view their confirmation)
CREATE POLICY "Anyone can view payment confirmations by id"
  ON public.payment_confirmations
  FOR SELECT
  USING (true);

-- Only service role inserts (from edge function)
-- No insert/update/delete policy for anon = only service role can write
