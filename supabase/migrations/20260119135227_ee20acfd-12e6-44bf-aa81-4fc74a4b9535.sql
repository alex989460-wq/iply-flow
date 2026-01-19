-- Create table for billing schedule settings
CREATE TABLE public.billing_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  send_time time NOT NULL DEFAULT '09:00:00',
  send_d_minus_1 boolean NOT NULL DEFAULT true,
  send_d0 boolean NOT NULL DEFAULT true,
  send_d_plus_1 boolean NOT NULL DEFAULT true,
  last_run_at timestamp with time zone,
  last_run_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_schedule UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.billing_schedule ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own schedule"
ON public.billing_schedule
FOR SELECT
USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert own schedule"
ON public.billing_schedule
FOR INSERT
WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can update own schedule"
ON public.billing_schedule
FOR UPDATE
USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can delete own schedule"
ON public.billing_schedule
FOR DELETE
USING (auth.uid() = user_id OR is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_billing_schedule_updated_at
BEFORE UPDATE ON public.billing_schedule
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();