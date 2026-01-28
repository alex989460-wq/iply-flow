-- Create expenses table for admin personal finance tracking
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  due_date DATE,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_day INTEGER,
  icon TEXT DEFAULT 'Receipt',
  color TEXT DEFAULT 'primary',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Only admins can manage expenses
CREATE POLICY "Only admins can view expenses"
ON public.expenses
FOR SELECT
USING (is_admin() AND auth.uid() = user_id);

CREATE POLICY "Only admins can insert expenses"
ON public.expenses
FOR INSERT
WITH CHECK (is_admin() AND auth.uid() = user_id);

CREATE POLICY "Only admins can update expenses"
ON public.expenses
FOR UPDATE
USING (is_admin() AND auth.uid() = user_id);

CREATE POLICY "Only admins can delete expenses"
ON public.expenses
FOR DELETE
USING (is_admin() AND auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();