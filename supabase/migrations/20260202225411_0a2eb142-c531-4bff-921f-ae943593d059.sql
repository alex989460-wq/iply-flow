-- Create goals_settings table
CREATE TABLE public.goals_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  customers_goal INTEGER NOT NULL DEFAULT 200,
  revenue_goal NUMERIC NOT NULL DEFAULT 10000,
  projection_goal NUMERIC NOT NULL DEFAULT 15000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.goals_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own goals" ON public.goals_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals" ON public.goals_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON public.goals_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON public.goals_settings
  FOR DELETE USING (auth.uid() = user_id);