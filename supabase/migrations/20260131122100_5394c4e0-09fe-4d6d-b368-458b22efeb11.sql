-- Create table for local departments/agents (works for both Zap Responder and Meta Cloud API)
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own departments" 
ON public.departments 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own departments" 
ON public.departments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own departments" 
ON public.departments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own departments" 
ON public.departments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_departments_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();