-- Create billing_settings table for per-reseller PIX and pricing configuration
CREATE TABLE public.billing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  pix_key TEXT DEFAULT '',
  pix_key_type TEXT DEFAULT 'celular',
  monthly_price NUMERIC DEFAULT 35.00,
  quarterly_price NUMERIC DEFAULT 90.00,
  semiannual_price NUMERIC DEFAULT 175.00,
  annual_price NUMERIC DEFAULT 300.00,
  custom_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only view/manage their own settings
CREATE POLICY "Users can view own billing_settings"
ON public.billing_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own billing_settings"
ON public.billing_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own billing_settings"
ON public.billing_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own billing_settings"
ON public.billing_settings FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_billing_settings_updated_at
BEFORE UPDATE ON public.billing_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();