-- Create table for multiple Vplay server configurations
CREATE TABLE public.vplay_servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  server_name TEXT NOT NULL,
  integration_url TEXT NOT NULL,
  key_message TEXT NOT NULL DEFAULT 'XCLOUD',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vplay_servers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own vplay_servers" 
ON public.vplay_servers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vplay_servers" 
ON public.vplay_servers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vplay_servers" 
ON public.vplay_servers 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vplay_servers" 
ON public.vplay_servers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_vplay_servers_updated_at
BEFORE UPDATE ON public.vplay_servers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();