
-- Table for configurable activation apps
CREATE TABLE public.activation_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_name text NOT NULL,
  description text,
  icon text DEFAULT 'Smartphone',
  requires_email boolean DEFAULT false,
  requires_mac boolean DEFAULT true,
  is_enabled boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activation_apps" ON public.activation_apps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activation_apps" ON public.activation_apps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activation_apps" ON public.activation_apps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own activation_apps" ON public.activation_apps FOR DELETE USING (auth.uid() = user_id);

-- Table to log activation requests
CREATE TABLE public.activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  app_name text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  mac_address text,
  email text,
  payment_method text,
  amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  cakto_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activation_requests" ON public.activation_requests FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Service can insert activation_requests" ON public.activation_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own activation_requests" ON public.activation_requests FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can delete own activation_requests" ON public.activation_requests FOR DELETE USING (auth.uid() = user_id OR is_admin());
