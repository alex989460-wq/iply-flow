-- Create enum types
CREATE TYPE public.server_status AS ENUM ('online', 'offline', 'manutencao');
CREATE TYPE public.customer_status AS ENUM ('ativa', 'inativa', 'suspensa');
CREATE TYPE public.payment_method AS ENUM ('pix', 'dinheiro', 'transferencia');
CREATE TYPE public.billing_type AS ENUM ('D-1', 'D0', 'D+1');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create servers table
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL,
  host TEXT NOT NULL,
  description TEXT,
  status server_status NOT NULL DEFAULT 'online',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status customer_status NOT NULL DEFAULT 'ativa',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method payment_method NOT NULL DEFAULT 'pix',
  confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create billing_logs table
CREATE TABLE public.billing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  billing_type billing_type NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  whatsapp_status TEXT
);

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check admin role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- RLS Policies for servers (admin only)
CREATE POLICY "Admins can view servers" ON public.servers FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert servers" ON public.servers FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update servers" ON public.servers FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can delete servers" ON public.servers FOR DELETE TO authenticated USING (public.is_admin());

-- RLS Policies for plans (admin only)
CREATE POLICY "Admins can view plans" ON public.plans FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert plans" ON public.plans FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update plans" ON public.plans FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can delete plans" ON public.plans FOR DELETE TO authenticated USING (public.is_admin());

-- RLS Policies for customers (admin only)
CREATE POLICY "Admins can view customers" ON public.customers FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE TO authenticated USING (public.is_admin());

-- RLS Policies for payments (admin only)
CREATE POLICY "Admins can view payments" ON public.payments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can delete payments" ON public.payments FOR DELETE TO authenticated USING (public.is_admin());

-- RLS Policies for billing_logs (admin only)
CREATE POLICY "Admins can view billing_logs" ON public.billing_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert billing_logs" ON public.billing_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to renew customer due_date after payment confirmation
CREATE OR REPLACE FUNCTION public.renew_customer_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  plan_duration INTEGER;
BEGIN
  IF NEW.confirmed = true AND OLD.confirmed = false THEN
    SELECT duration_days INTO plan_duration
    FROM public.plans p
    JOIN public.customers c ON c.plan_id = p.id
    WHERE c.id = NEW.customer_id;
    
    IF plan_duration IS NOT NULL THEN
      UPDATE public.customers
      SET due_date = CURRENT_DATE + plan_duration,
          status = 'ativa'
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_payment_confirmed
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.renew_customer_due_date();

-- Insert default plans
INSERT INTO public.plans (plan_name, duration_days, price) VALUES
  ('Mensal', 30, 35.00),
  ('Trimestral', 90, 90.00),
  ('Semestral', 180, 160.00),
  ('Anual', 365, 300.00);