-- Create table to track reseller access/subscriptions
CREATE TABLE public.reseller_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    email text NOT NULL,
    full_name text,
    access_expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reseller_access ENABLE ROW LEVEL SECURITY;

-- Only admins can manage reseller access
CREATE POLICY "Admins can view reseller_access"
ON public.reseller_access
FOR SELECT
USING (is_admin());

CREATE POLICY "Admins can insert reseller_access"
ON public.reseller_access
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update reseller_access"
ON public.reseller_access
FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete reseller_access"
ON public.reseller_access
FOR DELETE
USING (is_admin());

-- Users can view their own access status
CREATE POLICY "Users can view own access"
ON public.reseller_access
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_reseller_access_updated_at
BEFORE UPDATE ON public.reseller_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create reseller_access when a new profile is created (excluding first admin)
CREATE OR REPLACE FUNCTION public.create_reseller_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
BEGIN
  -- Get the user's email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  
  -- Only create reseller_access if user is not admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin') THEN
    INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at)
    VALUES (NEW.user_id, COALESCE(user_email, ''), NEW.full_name, now() + interval '30 days');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Trigger to auto-create reseller_access after profile creation
CREATE TRIGGER create_reseller_access_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_reseller_access();

-- Insert existing non-admin users into reseller_access
INSERT INTO public.reseller_access (user_id, email, full_name, access_expires_at)
SELECT 
  p.user_id,
  COALESCE(u.email, ''),
  p.full_name,
  now() + interval '30 days'
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin'
)
AND NOT EXISTS (
  SELECT 1 FROM public.reseller_access ra WHERE ra.user_id = p.user_id
);